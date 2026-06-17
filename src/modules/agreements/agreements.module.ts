import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { AgreementsRepository } from './agreements.repository';
import { AgreementsService } from './agreements.service';
import { AgreementsController } from './agreements.controller';
import { MeAgreementsController } from './me-agreements.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard (회원 인증)
  controllers: [AgreementsController, MeAgreementsController],
  providers: [AgreementsRepository, AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
