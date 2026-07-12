import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class RankingsQueryDto extends createZodDto(
  z.object({
    scope: z.enum(['NATIONAL']).default('NATIONAL'),
    period: z.enum(['CUMULATIVE', 'MONTHLY']).default('CUMULATIVE'),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}
