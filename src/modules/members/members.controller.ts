import { Controller, Delete, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import type { AuthUser } from '@modules/auth/auth.types';
import { UsersService } from '@modules/users/users.service';

@ApiTags('members')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly users: UsersService) {}

  /** 회원 탈퇴 — 활동 데이터 삭제 + WITHDRAWN. 같은 소셜계정 재로그인 시 복원. */
  @ApiOperation({ summary: '회원 탈퇴' })
  @Delete('me')
  withdraw(@CurrentUser() user: AuthUser) {
    return this.users.withdraw(user.userId);
  }
}
