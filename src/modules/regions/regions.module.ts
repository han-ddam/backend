import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { RegionsRepository } from './regions.repository';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuthModule], // OptionalJwtAuthGuard 사용 (AuthModule이 JwtModule과 함께 export)
  controllers: [RegionsController],
  providers: [RegionsRepository, RegionsService],
})
export class RegionsModule {}
