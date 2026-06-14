import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Create a staff/admin account (email + password). Postman-only endpoint. */
export class CreateAdminUserDto extends createZodDto(
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
    displayName: z.string().min(1),
    role: z.enum(['ADMIN', 'MODERATOR', 'CURATOR']).optional(),
  }),
) {}
