import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateWeightConfigDto extends createZodDto(
  z.object({
    name: z.string().min(1).max(100),
    visitWeight: z.number().min(0).max(99.99),
    photoWeight: z.number().min(0).max(99.99),
  }),
) {}

export class UpdateWeightConfigDto extends createZodDto(
  z.object({
    name: z.string().min(1).max(100).optional(),
    visitWeight: z.number().min(0).max(99.99).optional(),
    photoWeight: z.number().min(0).max(99.99).optional(),
  }),
) {}

export class WeightConfigListQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}

export class AssignWeightConfigDto extends createZodDto(
  z.object({ configId: z.string().uuid().nullable() }),
) {}
