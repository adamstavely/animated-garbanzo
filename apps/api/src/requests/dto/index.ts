import {
  ApprovePayload,
  ChooseCandidatePayload,
  CreateRequestPayload,
  GenerateRequestPayload,
  ORIGIN_VALUES,
  PRESENTATIONS,
  Presentation,
  ToggleLockPayload,
  UpdatePromptSettingsPayload,
  UpdateRequestPayload,
} from '@nym/shared';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRequestDto implements CreateRequestPayload {
  @ApiProperty({ example: 'Margaret' })
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  firstName = '';

  @ApiPropertyOptional({
    example: 'E',
    description: 'Single letter; stored as "E." in the legal name.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]?\.?$/, { message: 'middleInitial must be a single letter' })
  @Transform(trim)
  middleInitial?: string;

  @ApiProperty({ example: 'Voss' })
  @IsString()
  @MaxLength(100)
  @Transform(trim)
  lastName = '';

  @ApiProperty({ enum: PRESENTATIONS })
  @IsIn(PRESENTATIONS)
  presentation: Presentation = 'Unisex';

  @ApiPropertyOptional({ enum: ORIGIN_VALUES })
  @IsOptional()
  @IsIn(ORIGIN_VALUES, { message: 'origin must be one of the supported options' })
  origin?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  notes?: string;
}

export class UpdateRequestDto implements UpdateRequestPayload {
  @ApiPropertyOptional({ example: 'Margaret E. Voss' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  legalName?: string;

  @ApiPropertyOptional({ enum: PRESENTATIONS })
  @IsOptional()
  @IsIn(PRESENTATIONS)
  presentation?: Presentation;

  @ApiPropertyOptional({ enum: ORIGIN_VALUES })
  @IsOptional()
  @IsIn(ORIGIN_VALUES, { message: 'origin must be one of the supported options' })
  origin?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  notes?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  refine?: string;
}

export class GenerateRequestDto implements GenerateRequestPayload {
  @ApiPropertyOptional({ description: 'Keep locked candidates and replace the rest.' })
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @ApiPropertyOptional({ maxLength: 500, description: 'Steer applied to this pass only.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trim)
  refine?: string;
}

export class ApproveRequestDto implements ApprovePayload {
  @ApiPropertyOptional({ description: 'Defaults to the proposed name when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  penName?: string;
}

export class ChooseCandidateDto implements ChooseCandidatePayload {
  @ApiProperty({ description: 'Empty string clears the selection.' })
  @IsString()
  @MaxLength(255)
  @Transform(trim)
  penName = '';
}

export class ToggleLockDto implements ToggleLockPayload {
  @ApiProperty()
  @IsBoolean()
  locked = false;
}

export class UpdatePromptSettingsDto implements UpdatePromptSettingsPayload {
  @ApiProperty({ maxLength: 8000 })
  @IsString()
  @MaxLength(8000)
  system = '';

  @ApiProperty({ maxLength: 20000 })
  @IsString()
  @MaxLength(20000)
  prompt = '';
}

export class ListRequestsQueryDto {
  @ApiPropertyOptional({
    enum: ['queue', 'history', 'all'],
    description: 'queue = open requests, history = approved requests.',
  })
  @IsOptional()
  @IsIn(['queue', 'history', 'all'])
  view?: 'queue' | 'history' | 'all';

  @ApiPropertyOptional({
    description: 'Free-text search across names, candidates, origin and notes.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  q?: string;

  @ApiPropertyOptional({ description: 'Page size (capped by REQUESTS_LIST_MAX_LIMIT).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: 'Number of matching rows to skip.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
