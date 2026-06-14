import { Module } from '@nestjs/common';
import { UsersModule } from '@modules/users/users.module';
import { AdminController } from './admin.controller';
import { AdminKeyGuard } from './guards/admin-key.guard';

@Module({
  imports: [UsersModule],
  controllers: [AdminController],
  providers: [AdminKeyGuard],
})
export class AdminModule {}
