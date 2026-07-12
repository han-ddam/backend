import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { BookmarksRepository } from './bookmarks.repository';
import { BookmarksService } from './bookmarks.service';
import { BookmarksController } from './bookmarks.controller';

@Module({
  imports: [AuthModule], // JwtAuthGuard
  providers: [BookmarksRepository, BookmarksService],
  controllers: [BookmarksController],
})
export class BookmarksModule {}
