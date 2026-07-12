import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class DiscoveryQueryDto extends createZodDto(
  z.object({
    limit: z.coerce.number().int().min(1).max(20).optional(),
  }),
) {}
