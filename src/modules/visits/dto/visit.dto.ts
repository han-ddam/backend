import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateVisitDto extends createZodDto(
  z.object({ placeId: z.string().uuid() }),
) {}
