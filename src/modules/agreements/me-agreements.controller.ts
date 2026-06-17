import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { AgreementsService } from './agreements.service';
import { AcceptAgreementDto } from './dto/agreement.dto';

@ApiTags('agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/agreements')
export class MeAgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  /** 동의 기록 (멱등). */
  @Post()
  @HttpCode(204)
  async accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptAgreementDto) {
    await this.agreements.accept(user.userId, dto.agreementId);
  }

  /** 내 동의 이력. */
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.agreements.listMine(user.userId);
  }
}
