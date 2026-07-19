import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class SetRepresentativeDto extends createZodDto(
  z.object({ certImageId: z.string().uuid().describe('대표로 지정할 인증 이미지 id') }),
) {}
