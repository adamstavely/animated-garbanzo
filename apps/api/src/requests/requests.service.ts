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
import { composeLegalName, normaliseName } from '../generation/name-rules';
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

    const result = await this.requests.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Request ${id} was not found.`);
    }
  }

  /** Starts (or restarts) generation. Returns the request in its "generating" state. */
  async generate(id: string, dto: GenerateRequestDto, user: AuthenticatedUser): Promise<PenNameRequestDto> {
    await this.rateLimiter.consume(
      `generate:${user.id}`,
      this.rateLimit.generate,
      this.rateLimit.windowMs,
    );

    const request = await this.requireRequest(id);

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
    const expectedStatus = request.status;
    const penName = normaliseName(dto.penName);

    if (penName && !request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }

    await this.updateIfStatus(id, expectedStatus, { chosenName: penName });
    return this.findOne(id);
  }

  async toggleLock(
    id: string,
    candidateId: string,
    dto: ToggleLockDto,
  ): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);

    const candidate = await this.candidates.findOne({ where: { id: candidateId, requestId: id } });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${candidateId} was not found on request ${id}.`);
    }

    candidate.locked = dto.locked;
    await this.candidates.save(candidate);
    return this.findOne(id);
  }

  /**
   * Signs off a pen name. Defaults to the proposed name, which is what the queue's
   * Approve button means; the edit view sends the selected candidate explicitly.
   */
  async approve(
    id: string,
    dto: ApproveRequestDto,
    user: AuthenticatedUser,
  ): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    const expectedStatus = request.status;
    const penName = normaliseName(dto.penName ?? '') || resolveProposedName(request);

    if (!penName) {
      throw new BadRequestException('There is no cleared candidate to approve.');
    }
    if (!request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }

    await this.updateIfStatus(id, expectedStatus, this.approvalFields(penName, user));

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
      if (!penName) {
        continue;
      }

      const fields = this.approvalFields(penName, user);
      const result = await this.requests.update(
        { id: request.id, status: RequestStatus.Ready },
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

  /** Returns an approved request to the queue and clears its audit stamp. */
  async reopen(id: string): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);
    this.assertNotGenerating(request);
    const expectedStatus = request.status;

    await this.updateIfStatus(id, expectedStatus, {
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
    user: AuthenticatedUser,
  ): Promise<PromptSettingsDto> {
    return this.promptSettings.update(await this.requireRequest(id), dto, user.id);
  }

  async resetPromptSettings(id: string, user: AuthenticatedUser): Promise<PromptSettingsDto> {
    return this.promptSettings.reset(await this.requireRequest(id), user.id);
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
   */
  private async updateIfStatus(
    id: string,
    expectedStatus: RequestStatus,
    values: QueryDeepPartialEntity<PenNameRequestEntity>,
  ): Promise<void> {
    const result = await this.requests.update({ id, status: expectedStatus }, values);
    if (!result.affected) {
      throw new ConflictException('This request is still generating. Try again shortly.');
    }
  }

  private assertNotGenerating(request: PenNameRequestEntity): void {
    if (request.status === RequestStatus.Generating) {
      throw new ConflictException('This request is still generating. Try again shortly.');
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
