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
    role: z.enum(['SUPER_ADMIN', 'ADMIN']).optional(),
  }),
) {}

export class AdminRefreshDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}

export class AdminLogoutDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}

/** Pagination + search query for list endpoints. */
export class PageQueryDto extends createZodDto(
  z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    q: z.string().trim().min(1).optional(),
  }),
) {}

export class UpdateAdminDto extends createZodDto(
  z
    .object({
      name: z.string().min(1).optional(),
      role: z.enum(['SUPER_ADMIN', 'ADMIN']).optional(),
      isActive: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, {
      message: 'At least one field is required',
    }),
) {}

export class UpdateMemberStatusDto extends createZodDto(
  z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
) {}
