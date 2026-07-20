import { Injectable, NotFoundException } from '@nestjs/common';
import { IdService } from '@platform/id/id.service';
import { WeightConfigsRepository } from './weight-configs.repository';
import { CreateWeightConfigDto, UpdateWeightConfigDto } from './dto/weight-config.dto';

@Injectable()
export class WeightConfigsService {
  constructor(private readonly repo: WeightConfigsRepository, private readonly id: IdService) {}

  async adminCreate(dto: CreateWeightConfigDto): Promise<{ configId: string }> {
    const configId = this.id.generate();
    await this.repo.create({ id: configId, name: dto.name, visitWeight: dto.visitWeight, photoWeight: dto.photoWeight });
    return { configId };
  }

  async adminList(params: { page: number; limit: number }) {
    const { rows, total } = await this.repo.listPage({ limit: params.limit, offset: (params.page - 1) * params.limit });
    return { items: rows, total, page: params.page, limit: params.limit };
  }

  async adminUpdate(id: string, dto: UpdateWeightConfigDto): Promise<{ updated: true }> {
    const ok = await this.repo.update(id, dto);
    if (!ok) throw new NotFoundException('weight config not found');
    return { updated: true };
  }

  async adminDelete(id: string): Promise<void> {
    const ok = await this.repo.deleteById(id);
    if (!ok) throw new NotFoundException('weight config not found');
  }

  exists(id: string): Promise<boolean> {
    return this.repo.exists(id);
  }
}
