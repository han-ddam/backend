import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const badgeTranslation = z.object({
  locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
  name: z.string().min(1),
  description: z.string().optional(),
});

export class CreateBadgeDto extends createZodDto(
  z.object({
    code: z.string().min(1),
    tier: z.coerce.number().int(),
    criteriaType: z.enum(['LEVEL', 'VISIT_COUNT']),
    criteriaValue: z.coerce.number().int().min(0),
    iconKey: z.string().optional(),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
    seq: z.coerce.number().int().min(0),
    translations: z
      .array(badgeTranslation)
      .min(1)
      .superRefine((arr, ctx) => {
        const seen = new Set<string>();
        for (const t of arr) {
          if (seen.has(t.locale)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `duplicate locale: ${t.locale}` });
          seen.add(t.locale);
        }
      }),
  }),
) {}

export class UpdateBadgeDto extends createZodDto(
  z.object({
    tier: z.coerce.number().int().optional(),
    criteriaValue: z.coerce.number().int().min(0).optional(),
    iconKey: z.string().optional(),
    status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
    seq: z.coerce.number().int().min(0).optional(),
  }),
) {}

export class AdminBadgeListQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}
