import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../auth/decorators';

/**
 * Two probes, deliberately different.
 *
 * Readiness reports whether this instance can serve traffic, which includes
 * reaching the database. Liveness reports only whether the process is still
 * answering: it must not touch the database, because a shared database blip
 * would otherwise fail liveness on every pod at once and restart the whole
 * deployment into a crash loop while the database is already struggling.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe: the process and its database.' })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.pingCheck('database', { timeout: 3000 })]);
  }

  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe: the process only, no dependencies.' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
