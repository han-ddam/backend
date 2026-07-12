import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BadgesRepository } from './badges.repository';
import { BadgesService } from './badges.service';
import { BadgesController } from './badges.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard
  providers: [BadgesRepository, BadgesService],
  controllers: [BadgesController],
  exports: [BadgesService],
})
export class BadgesModule {}
