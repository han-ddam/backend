import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { MembersController } from './members.controller';

@Module({
  imports: [AuthModule, UsersModule], // JwtAuthGuard(JwtService) + UsersService
  controllers: [MembersController],
})
export class MembersModule {}
