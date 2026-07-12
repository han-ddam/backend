import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SubmitRatingDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
    score: z.number().min(0.5).max(5).multipleOf(0.5).describe('별점 0.5~5.0, 0.5 단위'),
  }),
) {}
