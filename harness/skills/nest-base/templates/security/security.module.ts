// Plantilla del harness → src/common/security/security.module.ts
// Global: AuthController and MonitorController inject the same LoginAttemptLimiter.
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { LoginAttemptLimiter } from './login-attempts';

@Global()
@Module({
  providers: [
    {
      provide: LoginAttemptLimiter,
      useFactory: (config: ConfigService<AppConfig, true>): LoginAttemptLimiter =>
        new LoginAttemptLimiter(config.get('auth.login', { infer: true })),
      inject: [ConfigService],
    },
  ],
  exports: [LoginAttemptLimiter],
})
export class SecurityModule {}
