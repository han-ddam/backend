import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateBookmarkDto extends createZodDto(
  z.object({ placeId: z.string().uuid() }),
) {}
