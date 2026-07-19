import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SubmitCertificationDto extends createZodDto(
  z.object({
    placeId: z.string().uuid().describe('여행지 UUID'),
    imageKeys: z.array(z.string().min(1)).min(1).max(10).describe('업로드 응답 imageKey 배열(1~10장)'),
    representativeIndex: z.number().int().min(0).describe('대표 커버 index(imageKeys 기준 0-base)'),
    deviceLat: z.number().min(33).max(39).describe('촬영 위도(근접판정용, 미저장)'),
    deviceLng: z.number().min(124).max(132).describe('촬영 경도(근접판정용, 미저장)'),
    capturedAt: z.string().datetime().optional().describe('촬영 시각(ISO, 참고용)'),
    caption: z.string().max(500).optional().describe('한 줄 기록(선택)'),
    visibility: z.enum(['PRIVATE', 'PUBLIC']).default('PRIVATE').describe('공개 설정'),
  }).refine((d) => d.representativeIndex < d.imageKeys.length, {
    message: 'representativeIndex out of range',
    path: ['representativeIndex'],
  }),
) {}
