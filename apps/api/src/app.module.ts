import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { AppConfig, loadConfiguration } from './config/configuration';
import { ENTITIES, MIGRATIONS } from './database/data-source';
import { GenerationModule } from './generation/generation.module';
import { HealthModule } from './health/health.module';
import { RequestsModule } from './requests/requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [loadConfiguration],
      // `loadConfiguration` validates the whole environment with zod, so Nest's
      // own per-key validation would only duplicate it.
      validate: (env) => {
        loadConfiguration(env as NodeJS.ProcessEnv);
        return env;
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => {
        const database = configService.get('database', { infer: true });
        return {
          type: 'postgres' as const,
          url: database.url,
          ssl: database.ssl
            ? { rejectUnauthorized: database.sslRejectUnauthorized }
            : false,
          entities: [...ENTITIES],
          migrations: [...MIGRATIONS],
          migrationsTableName: 'nym_migrations',
          synchronize: database.synchronize,
          logging: database.logging,
          autoLoadEntities: false,
        };
      },
    }),
    AuthModule,
    GenerationModule,
    RequestsModule,
    HealthModule,
  ],
})
export class AppModule {}
