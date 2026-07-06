import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RegionPlacesQueryDto extends createZodDto(
  z.object({
    status: z.enum(['ALL', 'VISITED']).default('ALL'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

export class RecommendedQueryDto extends createZodDto(
  z.object({
    limit: z.coerce.number().int().min(1).max(10).default(1),
  }),
) {}
