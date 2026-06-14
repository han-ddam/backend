import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UsersService } from '@modules/users/users.service';
import { AdminKeyGuard } from './guards/admin-key.guard';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';

/**
 * Internal admin endpoints — protected by the `x-admin-key` header (Postman-only).
 * There is no public email signup; staff accounts are created here.
 */
@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(private readonly users: UsersService) {}

  @Post('users')
  async createUser(@Body() dto: CreateAdminUserDto) {
    const user = await this.users.createEmailUser(dto);
    return this.users.toPublicProfile(user);
  }
}
