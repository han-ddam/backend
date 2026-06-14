import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const translation = z.object({
  locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
  name: z.string().min(1),
  address: z.string().optional(),
  description: z.string().optional(),
  mission: z.string().optional(),
});

export class CreatePlaceDto extends createZodDto(
  z.object({
    regionCode: z.string().min(1),
    tourapiContentId: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    basePoints: z.coerce.number().int().min(0).default(0),
    rarityWeight: z.coerce.number().min(0).max(99).default(1),
    tags: z.array(z.string()).optional(),
    translations: z.array(translation).min(1),
  }),
) {}

export class PlaceListQueryDto extends createZodDto(
  z.object({
    province: z.string().min(1),
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

export class AdminPlaceListQueryDto extends createZodDto(
  z.object({
    province: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}
