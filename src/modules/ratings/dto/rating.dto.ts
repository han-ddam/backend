import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SubmitRatingDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
    score: z.number().min(0.5).max(5).multipleOf(0.5).describe('별점 0.5~5.0, 0.5 단위'),
  }),
) {}

export class SubmitReviewDto extends createZodDto(
  z.object({
    placeId: z.string().uuid(),
    comment: z.string().trim().min(1).max(1000).describe('후기 1~1000자'),
  }),
) {}

export class ReviewsQueryDto extends createZodDto(
  z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  }),
) {}
