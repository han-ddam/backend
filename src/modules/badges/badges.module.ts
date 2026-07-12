import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AdminModule } from '@modules/admin/admin.module';
import { BadgesRepository } from './badges.repository';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';
import { AdminBadgesController } from './admin-badges.controller';

@Module({
  imports: [AuthModule, AdminModule], // JwtAuthGuard, AdminJwtGuard/AdminRolesGuard
  providers: [BadgesRepository, BadgesService],
  controllers: [BadgesController, AdminBadgesController],
  exports: [BadgesService],
})
export class BadgesModule {}
