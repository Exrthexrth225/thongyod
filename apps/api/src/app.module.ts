import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'
import { DatabaseService } from './db/database.service.js'
import { AuthController } from './auth/auth.controller.js'
import { SessionService } from './auth/session.service.js'
import { ALLOW_DEV_SESSIONS } from './auth/policy.js'
import { SocialController } from './social/social.controller.js'
import { SocialService } from './social/social.service.js'
import { FriendLinksService } from './social/friend-links.service.js'
import { MeetupsService } from './social/meetups.service.js'
import { MeetupsController } from './social/meetups.controller.js'
import { ProfilesService } from './social/profiles.service.js'
import { MediaService } from './social/media.service.js'
import { MediaController } from './social/media.controller.js'
import { ActivityController } from './social/activity.controller.js'
import { ActivityService } from './social/activity.service.js'
import { RoomsController } from './social/rooms.controller.js'
import { RoomsService } from './social/rooms.service.js'
import { LineService } from './auth/line.service.js'
import { LineController } from './auth/line.controller.js'

@Module({
  controllers: [HealthController, AuthController, SocialController, MeetupsController, MediaController, ActivityController, RoomsController, LineController],
  providers: [DatabaseService, SessionService, SocialService, FriendLinksService, MeetupsService, ProfilesService, MediaService, ActivityService, RoomsService, LineService, { provide: ALLOW_DEV_SESSIONS, useValue: false }],
  exports: [DatabaseService, SessionService],
})
export class AppModule {}
