import {
  BulkApproveResultDto,
  PenNameRequestDto,
  PromptSettingsDto,
  RequestListDto,
  RequestStatus,
} from '@nym/shared';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { AuthenticatedUser } from '../auth/authenticated-user';
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

  constructor(
    @InjectRepository(PenNameRequestEntity)
    private readonly requests: Repository<PenNameRequestEntity>,
    @InjectRepository(CandidateEntity)
    private readonly candidates: Repository<CandidateEntity>,
    private readonly generation: GenerationService,
    private readonly promptSettings: PromptSettingsService,
  ) {}

  async list(query: ListRequestsQueryDto): Promise<RequestListDto> {
    const view = query.view ?? 'all';
    const search = query.q?.trim() ?? '';

    const matching = await this.findMatching(search);

    const queueMatches = matching.filter((request) => request.status !== RequestStatus.Approved);
    const historyMatches = matching.filter((request) => request.status === RequestStatus.Approved);

    const items = view === 'queue' ? queueMatches : view === 'history' ? historyMatches : matching;

    return {
      items: items.map(toRequestDto),
      queueMatchCount: queueMatches.length,
      historyMatchCount: historyMatches.length,
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

    if (dto.legalName !== undefined) {
      const legalName = normaliseName(dto.legalName);
      if (!legalName) {
        throw new BadRequestException('The legal name cannot be empty.');
      }
      request.legalName = legalName;
    }
    if (dto.presentation !== undefined) {
      request.presentation = dto.presentation;
    }
    if (dto.origin !== undefined) {
      request.origin = dto.origin;
    }
    if (dto.notes !== undefined) {
      request.notes = dto.notes;
    }
    if (dto.refine !== undefined) {
      request.refine = dto.refine;
    }

    await this.requests.save(request);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const result = await this.requests.delete(id);
    if (!result.affected) {
      throw new NotFoundException(`Request ${id} was not found.`);
    }
  }

  /** Starts (or restarts) generation. Returns the request in its "generating" state. */
  async generate(id: string, dto: GenerateRequestDto): Promise<PenNameRequestDto> {
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
    const penName = normaliseName(dto.penName);

    if (penName && !request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }

    request.chosenName = penName;
    await this.requests.save(request);
    return this.findOne(id);
  }

  async toggleLock(
    id: string,
    candidateId: string,
    dto: ToggleLockDto,
  ): Promise<PenNameRequestDto> {
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
    const penName = normaliseName(dto.penName ?? '') || resolveProposedName(request);

    if (!penName) {
      throw new BadRequestException('There is no cleared candidate to approve.');
    }
    if (!request.candidates.some((candidate) => candidate.name === penName)) {
      throw new BadRequestException('That name is not among the cleared candidates.');
    }

    this.applyApproval(request, penName, user);
    await this.requests.save(request);

    return this.findOne(id);
  }

  /** Approves the proposed name of every request that is ready for review. */
  async approveAll(user: AuthenticatedUser): Promise<BulkApproveResultDto> {
    const ready = await this.requests.find({
      where: { status: RequestStatus.Ready },
      relations: { candidates: true },
    });

    const approvable = ready.filter((request) => resolveProposedName(request) !== '');

    for (const request of approvable) {
      this.applyApproval(request, resolveProposedName(request), user);
    }

    if (approvable.length > 0) {
      await this.requests.save(approvable);
    }

    this.logger.log(`${user.name} bulk-approved ${approvable.length} request(s)`);

    return {
      approvedCount: approvable.length,
      requests: approvable.map(toRequestDto),
    };
  }

  /** Returns an approved request to the queue and clears its audit stamp. */
  async reopen(id: string): Promise<PenNameRequestDto> {
    const request = await this.requireRequest(id);

    request.approvedName = '';
    request.approvedByName = '';
    request.approvedById = null;
    request.approvedAt = null;
    request.status = request.candidates.length > 0 ? RequestStatus.Ready : RequestStatus.Queued;

    await this.requests.save(request);
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

  private applyApproval(
    request: PenNameRequestEntity,
    penName: string,
    user: AuthenticatedUser,
  ): void {
    request.approvedName = penName;
    request.chosenName = penName;
    request.approvedByName = user.name;
    request.approvedById = user.id;
    request.approvedAt = new Date();
    request.status = RequestStatus.Approved;
  }

  private async findMatching(search: string): Promise<PenNameRequestEntity[]> {
    const query = this.requests
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.candidates', 'candidate')
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('candidate.position', 'ASC');

    if (search) {
      // Candidates are matched with EXISTS rather than a join predicate so that a
      // hit on one candidate does not prune the request's other candidates.
      query.andWhere(
        new Brackets((where) => {
          where
            .where('request.legalName ILIKE :term')
            .orWhere('request.approvedName ILIKE :term')
            .orWhere('request.chosenName ILIKE :term')
            .orWhere('request.origin ILIKE :term')
            .orWhere('request.notes ILIKE :term')
            .orWhere('request.presentation ILIKE :term')
            .orWhere(
              'EXISTS (SELECT 1 FROM candidates match WHERE match."requestId" = request.id AND match.name ILIKE :term)',
            );
        }),
        { term: `%${search}%` },
      );
    }

    return query.getMany();
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
