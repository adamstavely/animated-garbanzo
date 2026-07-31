import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

import { Public } from '../auth/decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
  ) {}

  /**
   * Process liveness — does not touch the database. Safe for a k8s liveness probe
   * so a transient DB blip does not restart the pod.
   */
  @Public()
  @Get('live')
  @ApiOperation({ summary: 'Process liveness probe (no dependency checks).' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Database readiness — use for readiness / startup probes. */
  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — database must respond.' })
  ready(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.pingCheck('database', { timeout: 3000 })]);
  }

  /** Alias of `/health/ready` kept for existing monitors. */
  @Public()
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe (alias of /health/ready).' })
  check(): Promise<HealthCheckResult> {
    return this.ready();
  }
}
