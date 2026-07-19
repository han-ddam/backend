import { Module } from '@nestjs/common';
import { AdminModule } from '@modules/admin/admin.module';
import { AuthModule } from '@modules/auth/auth.module';
import { DogamModule } from '@modules/dogam/dogam.module';
import { RepresentativesModule } from '@modules/representatives/representatives.module';
import { CollectionsRepository } from './collections.repository';
import { CollectionsService } from './collections.service';
import { CollectionsController } from './collections.controller';
import { MeCollectionsController } from './me-collections.controller';
import { AdminCollectionsController } from './admin-collections.controller';

@Module({
  imports: [AuthModule, DogamModule, AdminModule, RepresentativesModule], // OptionalJwtAuthGuard, DogamService(regions), admin 가드, RepresentativeService(resolver)
  providers: [CollectionsRepository, CollectionsService],
  controllers: [CollectionsController, MeCollectionsController, AdminCollectionsController],
})
export class CollectionsModule {}
