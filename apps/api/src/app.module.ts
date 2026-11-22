import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'
import { DatabaseService } from './db/database.service.js'
import { AuthController } from './auth/auth.controller.js'
import { SessionService } from './auth/session.service.js'
import { ALLOW_DEV_SESSIONS } from './auth/policy.js'
import { SocialController } from './social/social.controller.js'
import { SocialService } from './social/social.service.js'

@Module({
  controllers: [HealthController, AuthController, SocialController],
  providers: [DatabaseService, SessionService, SocialService, { provide: ALLOW_DEV_SESSIONS, useValue: false }],
  exports: [DatabaseService, SessionService],
})
export class AppModule {}
