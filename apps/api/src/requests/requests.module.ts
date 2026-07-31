import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CandidateEntity, PenNameRequestEntity } from '../database/entities';
import { RateLimiter } from '../common/rate-limiter';
import { GenerationModule } from '../generation/generation.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [TypeOrmModule.forFeature([PenNameRequestEntity, CandidateEntity]), GenerationModule],
  controllers: [RequestsController],
  providers: [RequestsService, RateLimiter],
  exports: [RequestsService],
})
export class RequestsModule {}
