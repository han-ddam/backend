import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '@platform/database/drizzle.constants';
import { scoreWeightConfigs, type ScoreWeightConfig } from '@db/schema';

@Injectable()
export class WeightConfigsRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async create(input: { id: string; name: string; visitWeight: number; photoWeight: number }): Promise<void> {
    await this.db.insert(scoreWeightConfigs).values({
      id: input.id, name: input.name,
      visitWeight: input.visitWeight.toFixed(2), photoWeight: input.photoWeight.toFixed(2),
    });
  }

  async listPage(p: { limit: number; offset: number }): Promise<{ rows: ScoreWeightConfig[]; total: number }> {
    const rows = await this.db.select().from(scoreWeightConfigs)
      .orderBy(desc(scoreWeightConfigs.createdAt)).limit(p.limit).offset(p.offset);
    const [{ total }] = await this.db.select({ total: sql<number>`count(*)::int` }).from(scoreWeightConfigs);
    return { rows, total: Number(total) };
  }

  async update(id: string, patch: { name?: string; visitWeight?: number; photoWeight?: number }): Promise<boolean> {
    const set: Record<string, unknown> = {};
    if (patch.name !== undefined) set.name = patch.name;
    if (patch.visitWeight !== undefined) set.visitWeight = patch.visitWeight.toFixed(2);
    if (patch.photoWeight !== undefined) set.photoWeight = patch.photoWeight.toFixed(2);
    if (Object.keys(set).length === 0) return this.exists(id);
    const r = await this.db
      .update(scoreWeightConfigs)
      .set(set)
      .where(eq(scoreWeightConfigs.id, id))
      .returning({ id: scoreWeightConfigs.id });
    return r.length > 0;
  }

  async deleteById(id: string): Promise<boolean> {
    const r = await this.db.delete(scoreWeightConfigs).where(eq(scoreWeightConfigs.id, id)).returning({ id: scoreWeightConfigs.id });
    return r.length > 0;
  }

  async exists(id: string): Promise<boolean> {
    const [row] = await this.db.select({ id: scoreWeightConfigs.id }).from(scoreWeightConfigs).where(eq(scoreWeightConfigs.id, id));
    return !!row;
  }
}
