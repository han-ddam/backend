import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateVisitDto extends createZodDto(
  z.object({
    placeId: z.string().uuid().describe('여행지 UUID (GET /api/places 목록에서 획득)'),
  }),
) {}
