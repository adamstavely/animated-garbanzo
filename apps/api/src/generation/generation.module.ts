import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { AnthropicNameGeneratorService } from './anthropic-name-generator.service';
import { GenerationService } from './generation.service';
import { NAME_GENERATOR } from './name-generator.interface';
import { PromptBuilderService } from './prompt-builder.service';
import { PromptSettingsService } from './prompt-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([PenNameRequestEntity, CandidateEntity])],
  providers: [
    GenerationService,
    PromptBuilderService,
    PromptSettingsService,
    AnthropicNameGeneratorService,
    { provide: NAME_GENERATOR, useExisting: AnthropicNameGeneratorService },
  ],
  exports: [GenerationService, PromptBuilderService, PromptSettingsService, NAME_GENERATOR],
})
export class GenerationModule {}
