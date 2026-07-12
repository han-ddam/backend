import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CollectionDetailQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

export class ThemesQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

export class MyCollectionsQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
) {}

const collectionTranslation = z.object({
  locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
  title: z.string().min(1),
  description: z.string().optional(),
});

export class CreateCollectionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
    translations: z
      .array(collectionTranslation)
      .min(1)
      .superRefine((arr, ctx) => {
        const seen = new Set<string>();
        for (const t of arr) {
          if (seen.has(t.locale)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate locale: ${t.locale}` });
          }
          seen.add(t.locale);
        }
      }),
  }),
) {}

export class UpdateCollectionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0).optional(),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
  }),
) {}

export class AddCollectionPlaceDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
    seq: z.coerce.number().int().min(0),
  }),
) {}

export class AdminCollectionListQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}
