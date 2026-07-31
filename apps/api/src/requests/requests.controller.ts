import {
  BulkApproveResultDto,
  PenNameRequestDto,
  PromptSettingsDto,
  RequestListDto,
} from '@nym/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser, RequireAdmin } from '../auth/decorators';
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
import { RequestsService } from './requests.service';

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  @ApiOperation({ summary: 'Lists requests for the queue or history, with optional search.' })
  list(
    @Query() query: ListRequestsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestListDto> {
    return this.requests.list(query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Creates a request and starts generation immediately.' })
  create(
    @Body() dto: CreateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PenNameRequestDto> {
    return this.requests.create(dto, user);
  }

  /**
   * Declared before `:id` routes so "approve-all" is never parsed as a UUID.
   */
  @Post('approve-all')
  @RequireAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approves the proposed name of every ready request.' })
  approveAll(@CurrentUser() user: AuthenticatedUser): Promise<BulkApproveResultDto> {
    return this.requests.approveAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Loads a single request with its cleared candidates.' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<PenNameRequestDto> {
    return this.requests.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Updates the brief.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRequestDto,
  ): Promise<PenNameRequestDto> {
    return this.requests.update(id, dto);
  }

  @Delete(':id')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletes a request and its candidates.' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.requests.remove(id);
  }

  @Post(':id/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Starts a generation run. Returns immediately; poll the request for the outcome.',
  })
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PenNameRequestDto> {
    return this.requests.generate(id, dto, user);
  }

  @Post(':id/choose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Selects a candidate without approving it.' })
  choose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChooseCandidateDto,
  ): Promise<PenNameRequestDto> {
    return this.requests.chooseCandidate(id, dto);
  }

  @Patch(':id/candidates/:candidateId/lock')
  @ApiOperation({ summary: 'Locks or unlocks a candidate so it survives regeneration.' })
  toggleLock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body() dto: ToggleLockDto,
  ): Promise<PenNameRequestDto> {
    return this.requests.toggleLock(id, candidateId, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approves a pen name and moves the request to History.' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PenNameRequestDto> {
    return this.requests.approve(id, dto, user);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Returns an approved request to the queue.' })
  reopen(@Param('id', ParseUUIDPipe) id: string): Promise<PenNameRequestDto> {
    return this.requests.reopen(id);
  }

  @Get(':id/prompt')
  @ApiOperation({ summary: 'The live prompt and system instruction for this request.' })
  getPrompt(@Param('id', ParseUUIDPipe) id: string): Promise<PromptSettingsDto> {
    return this.requests.getPromptSettings(id);
  }

  @Patch(':id/prompt')
  @RequireAdmin()
  @ApiOperation({
    summary: 'Saves an edited prompt for this request only, sent verbatim on later runs.',
  })
  updatePrompt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromptSettingsDto,
  ): Promise<PromptSettingsDto> {
    return this.requests.updatePromptSettings(id, dto);
  }

  @Delete(':id/prompt')
  @RequireAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resets this request’s prompt to the brief-driven default.' })
  resetPrompt(@Param('id', ParseUUIDPipe) id: string): Promise<PromptSettingsDto> {
    return this.requests.resetPromptSettings(id);
  }
}
