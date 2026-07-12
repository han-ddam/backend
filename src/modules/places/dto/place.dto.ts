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
    status: z.enum(['ACTIVE', 'HIDDEN', 'PENDING_REVIEW']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
) {}

export class UpdatePlaceStatusDto extends createZodDto(
  z.object({ status: z.enum(['ACTIVE', 'HIDDEN']) }),
) {}

export class SubmitUserPlaceDto extends createZodDto(
  z.object({
    name: z.string().min(1).max(100).describe('장소 이름'),
    address: z.string().max(200).optional().describe('주소 (선택)'),
    lat: z.number().min(33).max(39).describe('위도 (한국 범위)'),
    lng: z.number().min(124).max(132).describe('경도 (한국 범위)'),
    description: z.string().max(500).optional().describe('설명 (선택)'),
  }),
) {}

export class NearbyQueryDto extends createZodDto(
  z.object({
    lat: z.coerce.number().min(33).max(39).describe('디바이스 위도(근접 판정용, 미저장)'),
    lng: z.coerce.number().min(124).max(132).describe('디바이스 경도(근접 판정용, 미저장)'),
    radius: z.coerce.number().int().min(1).max(50000).optional().describe('반경(m, 기본 2000)'),
    limit: z.coerce.number().int().min(1).max(100).optional().describe('최대 개수(기본 20)'),
  }),
) {}

export class CreateCompositionDto extends createZodDto(
  z.object({
    seq: z.coerce.number().int().min(0).describe('표시 순서'),
    source: z.enum(['CURATED', 'AI']).optional().describe('출처(기본 CURATED)'),
    imageKey: z.string().optional().describe('업로드 응답의 imageKey(선택)'),
    translations: z
      .array(
        z.object({
          locale: z.enum(['KO', 'EN', 'JA', 'ZH']),
          title: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .min(1)
      .superRefine((arr, ctx) => {
        const seen = new Set<string>();
        for (const t of arr) {
          if (seen.has(t.locale)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `duplicate locale: ${t.locale}`,
            });
          }
          seen.add(t.locale);
        }
      })
      .describe('번역(KO 필수)'),
  }),
) {}

export class PlaceCertFeedQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional().describe('최대 개수(기본 8)'),
  }),
) {}
