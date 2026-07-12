import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { MeCollectionsController } from './me-collections.controller';

@Module({
  imports: [AuthModule, DogamModule], // OptionalJwtAuthGuard, DogamService(regions)
  providers: [CollectionsRepository, CollectionsService],
  controllers: [CollectionsController, MeCollectionsController],
})
export class CollectionsModule {}
