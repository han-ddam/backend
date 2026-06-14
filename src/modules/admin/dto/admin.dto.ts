import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class AdminLoginDto extends createZodDto(
  z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
) {}

export class CreateAdminDto extends createZodDto(
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
    role: z.enum(['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'CURATOR']).optional(),
  }),
) {}

export class AdminRefreshDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}

export class AdminLogoutDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}
