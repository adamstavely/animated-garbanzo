import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfig } from '../config/configuration';
import { UserEntity } from '../database/entities';
import { AuthController } from './auth.controller';
import { OidcService } from './oidc.service';
import { RolesGuard } from './roles.guard';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionService } from './session.service';
import { UsersService } from './users.service';

/**
 * Global so `SessionService` is available to the app-wide guard without every
 * feature module having to import it.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('session', { infer: true }).secret,
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    OidcService,
    SessionService,
    UsersService,
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SessionService, UsersService, OidcService],
})
export class AuthModule {}
