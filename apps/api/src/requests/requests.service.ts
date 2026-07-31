import {
  BulkApproveResultDto,
  PenNameRequestDto,
  PromptSettingsDto,
  RequestListDto,
  RequestStatus,
} from '@nym/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, QueryDeepPartialEntity, Repository } from 'typeorm';

import { AuthenticatedUser } from '../auth/authenticated-user';
import { escapeIlikePattern } from '../common/ilike';
import { RateLimiter } from '../common/rate-limiter';
import { AppConfig } from '../config/configuration';
import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { GenerationService } from '../generation/generation.service';
import { composeLegalName, normaliseName, overlapsLegalName } from '../generation/name-rules';
import { PromptSettingsService } from '../generation/prompt-settings.service';
import {
  ApproveRequestDto,
  ChooseCandidateDto,
  CreateRequestDto,
  GenerateRequestDto,
  ListRequestsQueryDto,
  ToggleLockDto,
  UpdatePromptSettingsDto,
  UpdateRequestDto,
} from './dto';
import { resolveProposedName, toRequestDto } from './request.mapper';

/** Status drifted under a conditional write — not only generate races. */
const STATUS_CONFLICT =
  'This request changed while you were working. Refresh and try again.';

/**
 * Everything an assistant can do to a pen name request.
 *
 * Approvals, deletions and lock changes all funnel through here so the audit
 * fields (who approved, when) are stamped in exactly one place.
 */
@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);
  private readonly listDefaultLimit: number;
  private readonly listMaxLimit: number;
  private readonly approveAllLimit: number;
  private readonly rateLimit: AppConfig['rateLimit'];

  constructor(
    @InjectRepository(PenNameRequestEntity)
    private readonly requests: Repository<PenNameRequestEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidates: Repository<CandidateEntity>,
    private readonly generation: GenerationService,
    private readonly promptSettings: PromptSettingsService,
    private readonly rateLimiter: RateLimiter,
    configService: ConfigService<AppConfig, true>,
  ) {
    const requestsConfig = configService.get('requests', { infer: true });
    this.listDefaultLimit = requestsConfig.listDefaultLimit;
    this.listMaxLimit = requestsConfig.listMaxLimit;
    this.approveAllLimit = requestsConfig.approveAllLimit;
    this.rateLimit = configService.get('rateLimit', { infer: true });
  }

  async list(query: ListRequestsQueryDto, user: AuthenticatedUser): Promise<RequestListDto> {
    await this.rateLimiter.consume(`list:${user.id}`, this.rateLimit.list, this.rateLimit.windowMs);

    const view = query.view ?? 'all';
    const search = query.q?.trim() ?? '';
    const limit = Math.min(
      Math.max(query.limit ?? this.listDefaultLimit, 1),
      this.listMaxLimit,
    );
    const offset = Math.max(query.offset ?? 0, 0);

    // Counts and the page slice stay in SQL — never pull every matching id into Node.
    const [counts, pageIds] = await Promise.all([
      this.countMatchingByView(search),
      this.findPageIds(view, search, limit, offset),
    ]);
    const total =
      view === 'queue'
        ? counts.queue
        : view === 'history'
          ? counts.history
          : counts.queue + counts.history;
    const items =
      pageIds.length === 0 ? [] : (await this.loadByIds(pageIds)).map(toRequestDto);

    return {
      items,
      queueMatchCount: counts.queue,
      historyMatchCount: counts.history,
      total,
      limit,
      offset,
    };
  }

  async findOne(id: string): Promise<PenNameRequestDto> {
    return toRequestDto(await this.requireRequest(id));
  }

  /**
   * Creates a request and starts generation immediately — the assistant never has
   * to press Generate for a new request.
   */
  async create(dto: CreateRequestDto, user: AuthenticatedUser): Promise<PenNameRequestDto> {
    await this.rateLimiter.consume(
      `create:${user.id}`,
      this.rateLimit.create,
      this.rateLimit.windowMs,
    );

    const legalName = composeLegalName(dto.firstName, dto.middleInitial, dto.lastName);

    if (!legalName) {
      throw new BadRequestException('A first or last name is required.');
    }

    const saved = await this.requests.save(
      this.requests.create({
        legalName,
        presentation: dto.presentation,
        origin: dto.origin ?? '',
        notes: dto.notes ?? '',
        refine: '',
        status: RequestStatus.Queued,
        createdById: user.id,
      }),
    );

    const created = await this.requireRequest(saved.id);
    const { request } = await this.generation.start(created);

    return toRequestDto(request);
  }

  async update(id: string, dto: UpdateRequestDto): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    this.assertNotApproved(request);
    const expectedStatus = request.status;

    const patch: QueryDeepPartialEntity<PenNameRequestEntity> = {};

    if (dto.legalName !== undefined) {
      const legalName = normaliseName(dto.legalName);
      if (!legalName) {
        throw new BadRequestException('The legal name cannot be empty.');
      }
      patch.legalName = legalName;
    }
    if (dto.presentation !== undefined) {
      patch.presentation = dto.presentation;
    }
    if (dto.origin !== undefined) {
      patch.origin = dto.origin;
    }
    if (dto.notes !== undefined) {
      patch.notes = dto.notes;
    }
    if (dto.refine !== undefined) {
      patch.refine = dto.refine;
    }

    if (Object.keys(patch).length > 0) {
      await this.updateIfStatus(id, expectedStatus, patch);
    }
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);

    // Status in the WHERE so a concurrent generate claim cannot lose the row
    // (and CASCADE its candidates) while the worker is still mid-flight.
    const result = await this.requests.delete({ id, status: request.status });
    if (!result.affected) {
      throw new ConflictException(STATUS_CONFLICT);
    }
  }

  /**
   * Starts (or restarts) generation. Returns the request in its "generating" state.
   * Approved rows must go through reopen first — generate must not pull History
   * back into the queue while leaving a stale sign-off.
   */
  async generate(id: string, dto: GenerateRequestDto, user: AuthenticatedUser): Promise<PenNameRequestDto> {
    await this.rateLimiter.consume(
      `generate:${user.id}`,
      this.rateLimit.generate,
      this.rateLimit.windowMs,
    );

    const request = await this.requireRequest(id);

    if (request.status === RequestStatus.Approved) {
      throw new BadRequestException('Reopen this request before generating again.');
    }

    if (!request.legalName.trim()) {
      throw new BadRequestException('Add the author’s legal name first.');
    }

    const { request: started } = await this.generation.start(request, {
      regenerate: dto.regenerate === true,
      refine: dto.refine,
    });

    return toRequestDto(started);
  }

  /** Selects a candidate without approving it; an empty name clears the selection. */
  async chooseCandidate(id: string, dto: ChooseCandidateDto): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    this.assertNotApproved(request);
    const expectedStatus = request.status;
    const penName = normaliseName(dto.penName);

    if (penName && !request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }
    // Live re-screen: a brief legal-name edit can invalidate a previously cleared name.
    if (penName) {
      this.assertClearOfLegalName(penName, request.legalName);
    }

    // Pin legalName when a selection is set so a concurrent brief edit cannot
    // flip overlap under this write (status-only WHERE would still succeed).
    await this.updateIfStatus(
      id,
      expectedStatus,
      { chosenName: penName },
      penName ? request.legalName : undefined,
    );
    return this.findOne(id);
  }

  /**
   * Locks or unlocks a candidate. Serialises with generate's claim: the request
   * row is locked under the status we read, so a mid-toggle claim cannot leave
   * execute's snapped keep/replace set disagreeing with the UI.
   */
  async toggleLock(
    id: string,
    candidateId: string,
    dto: ToggleLockDto,
  ): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    this.assertNotApproved(request);
    const expectedStatus = request.status;

    await this.requests.manager.transaction(async (manager) => {
      const current = await manager.findOne(PenNameRequestEntity, {
        where: { id, status: expectedStatus },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) {
        throw new ConflictException(STATUS_CONFLICT);
      }

      const result = await manager.update(
        CandidateEntity,
        { id: candidateId, requestId: id },
        { locked: dto.locked },
      );
      if (!result.affected) {
        throw new NotFoundException(`Candidate ${candidateId} was not found on request ${id}.`);
      }
    });

    return this.findOne(id);
  }

  /**
   * Signs off a pen name. Defaults to the proposed name, which is what the queue's
   * Approve button means; the edit view sends the selected candidate explicitly.
   * Only Ready rows may be approved — Failed leftovers and re-stamping Approved
   * are refused, matching approveAll.
   */
  async approve(
    id: string,
    dto: ApproveRequestDto,
    user: AuthenticatedUser,
  ): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertReadyForApproval(request);
    const penName = normaliseName(dto.penName ?? '') || resolveProposedName(request);

    if (!penName) {
      throw new BadRequestException('There is no cleared candidate to approve.');
    }
    if (!request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }
    // Same live overlap the Checks column and refine cards show after a brief edit.
    this.assertClearOfLegalName(penName, request.legalName);

    // Pin the legalName we screened so a concurrent Ready brief edit cannot
    // introduce overlap under an in-flight approve (status-only WHERE would).
    await this.updateIfStatus(
      id,
      RequestStatus.Ready,
      this.approvalFields(penName, user),
      request.legalName,
    );

    return this.findOne(id);
  }

  /** Approves the proposed name of every request that is ready for review. */
  async approveAll(user: AuthenticatedUser): Promise<BulkApproveResultDto> {
    await this.rateLimiter.consume(
      `approve-all:${user.id}`,
      this.rateLimit.approveAll,
      this.rateLimit.windowMs,
    );

    const ready = await this.requests.find({
      where: { status: RequestStatus.Ready },
      relations: { candidates: true },
      order: { createdAt: 'DESC' },
      take: this.approveAllLimit,
    });

    const approved: PenNameRequestEntity[] = [];

    for (const request of ready) {
      const penName = resolveProposedName(request);
      // Skip empty or live-overlap failures — same gate as single approve.
      if (!penName || overlapsLegalName(penName, request.legalName)) {
        continue;
      }

      const fields = this.approvalFields(penName, user);
      const result = await this.requests.update(
        { id: request.id, status: RequestStatus.Ready, legalName: request.legalName },
        fields,
      );
      if (!result.affected) {
        continue;
      }

      Object.assign(request, fields);
      approved.push(request);
    }

    this.logger.log(`${user.name} bulk-approved ${approved.length} request(s)`);

    return {
      approvedCount: approved.length,
      requests: approved.map(toRequestDto),
    };
  }

  /**
   * Returns an approved History row to the queue and clears its audit stamp.
   * Approved-only — Failed regen keeps prior candidates, and promoting those to
   * Ready would let approve launder past the Ready-only gate.
   */
  async reopen(id: string): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertApprovedForReopen(request);

    await this.updateIfStatus(id, RequestStatus.Approved, {
      approvedName: '',
      approvedByName: '',
      approvedById: null,
      approvedAt: null,
      status: request.candidates.length > 0 ? RequestStatus.Ready : RequestStatus.Queued,
    });

    return this.findOne(id);
  }

  async getPromptSettings(id: string): Promise<PromptSettingsDto> {
    return this.promptSettings.describeFor(await this.requireRequest(id));
  }

  async updatePromptSettings(
    id: string,
    dto: UpdatePromptSettingsDto,
  ): Promise<PromptSettingsDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    this.assertNotApproved(request);
    const patch = this.promptSettings.overrideColumns(request, dto);
    await this.updateIfStatus(id, request.status, patch);
    Object.assign(request, patch);
    return this.promptSettings.describeFor(request);
  }

  async resetPromptSettings(id: string): Promise<PromptSettingsDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    this.assertNotApproved(request);
    const patch = this.promptSettings.clearedOverrides();
    await this.updateIfStatus(id, request.status, patch);
    Object.assign(request, patch);
    return this.promptSettings.describeFor(request);
  }

  private approvalFields(
    penName: string,
    user: AuthenticatedUser,
  ): QueryDeepPartialEntity<PenNameRequestEntity> {
    return {
      approvedName: penName,
      chosenName: penName,
      approvedByName: user.name,
      approvedById: user.id,
      approvedAt: new Date(),
      status: RequestStatus.Approved,
    };
  }

  /**
   * Persists a patch only when status is still what we read. A concurrent
   * generate claim flips status to Generating; a stale entity.save() would
   * write Ready (etc.) back and erase the claim — this UPDATE cannot.
   *
   * When `expectedLegalName` is set (choose/approve after an overlap screen),
   * the row must still carry that name so a concurrent brief edit cannot flip
   * overlap under the status-only write.
   */
  private async updateIfStatus(
    id: string,
    expectedStatus: RequestStatus,
    values: QueryDeepPartialEntity<PenNameRequestEntity>,
    expectedLegalName?: string,
  ): Promise<void> {
    const where =
      expectedLegalName === undefined
        ? { id, status: expectedStatus }
        : { id, status: expectedStatus, legalName: expectedLegalName };
    const result = await this.requests.update(where, values);
    if (!result.affected) {
      throw new ConflictException(STATUS_CONFLICT);
    }
  }

  private assertNotGenerating(request: PenNameRequestEntity): void {
    if (request.status === RequestStatus.Generating) {
      throw new ConflictException('This request is still generating. Try again shortly.');
    }
  }

  /** History rows stay sealed until reopen — no silent brief, selection, lock, or prompt drift. */
  private assertNotApproved(request: PenNameRequestEntity): void {
    if (request.status === RequestStatus.Approved) {
      throw new BadRequestException('Reopen this request before making changes.');
    }
  }

  /**
   * Re-screens against the current legal name. Generation already filtered once,
   * but a later brief edit must not leave choose/approve able to sign off a name
   * the UI marks as overlapping.
   */
  private assertClearOfLegalName(penName: string, legalName: string): void {
    if (overlapsLegalName(penName, legalName)) {
      throw new BadRequestException('That name overlaps the author’s legal name.');
    }
  }

  /** Approve is Ready-only; Failed may still hold prior candidates. */
  private assertReadyForApproval(request: PenNameRequestEntity): void {
    this.assertNotGenerating(request);
    if (request.status !== RequestStatus.Ready) {
      throw new BadRequestException('Only ready requests can be approved.');
    }
  }

  /** Reopen is the History return path — not a Failed→Ready promotion. */
  private assertApprovedForReopen(request: PenNameRequestEntity): void {
    this.assertNotGenerating(request);
    if (request.status !== RequestStatus.Approved) {
      throw new BadRequestException('Only approved requests can be reopened.');
    }
  }

  /** Queue vs history match totals for the current search (one round trip). */
  private async countMatchingByView(
    search: string,
  ): Promise<{ queue: number; history: number }> {
    const query = this.requests
      .createQueryBuilder('request')
      .select(
        `COUNT(*) FILTER (WHERE request.status != :approved)`,
        'queue',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE request.status = :approved)`,
        'history',
      )
      .setParameter('approved', RequestStatus.Approved);

    this.applySearchFilter(query, search);

    const raw = await query.getRawOne<{ queue: string; history: string }>();
    return {
      queue: Number(raw?.queue ?? 0),
      history: Number(raw?.history ?? 0),
    };
  }

  /** Ids for one page only — candidates load separately for those rows. */
  private async findPageIds(
    view: 'queue' | 'history' | 'all',
    search: string,
    limit: number,
    offset: number,
  ): Promise<string[]> {
    const query = this.requests
      .createQueryBuilder('request')
      .select(['request.id'])
      .orderBy('request.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (view === 'queue') {
      query.andWhere('request.status != :approved', { approved: RequestStatus.Approved });
    } else if (view === 'history') {
      query.andWhere('request.status = :approved', { approved: RequestStatus.Approved });
    }

    this.applySearchFilter(query, search);

    const rows = await query.getMany();
    return rows.map((row) => row.id);
  }

  private applySearchFilter(
    query: ReturnType<Repository<PenNameRequestEntity>['createQueryBuilder']>,
    search: string,
  ): void {
    if (!search) {
      return;
    }

    // Escape user wildcards; keep our surrounding %…% as the only pattern metacharacters.
    const term = `%${escapeIlikePattern(search)}%`;
    query.andWhere(
      new Brackets((where) => {
        where
          .where(`request.legalName ILIKE :term ESCAPE '\\'`)
          .orWhere(`request.approvedName ILIKE :term ESCAPE '\\'`)
          .orWhere(`request.chosenName ILIKE :term ESCAPE '\\'`)
          .orWhere(`request.origin ILIKE :term ESCAPE '\\'`)
          .orWhere(`request.notes ILIKE :term ESCAPE '\\'`)
          .orWhere(`request.presentation ILIKE :term ESCAPE '\\'`)
          .orWhere(
            `EXISTS (SELECT 1 FROM candidates match WHERE match."requestId" = request.id AND match.name ILIKE :term ESCAPE '\\')`,
          );
      }),
      { term },
    );
  }

  private async loadByIds(ids: string[]): Promise<PenNameRequestEntity[]> {
    const rows = await this.requests.find({
      where: { id: In(ids) },
      relations: { candidates: true },
    });
    const order = new Map(ids.map((id, index) => [id, index]));
    return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  private async requireRequest(id: string): Promise<PenNameRequestEntity> {
    const request = await this.requests.findOne({
      where: { id },
      relations: { candidates: true },
    });

    if (!request) {
      throw new NotFoundException(`Request ${id} was not found.`);
    }

    return request;
  }
}
