import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** Mobile native-SDK flow: client sends the provider access token. */
export class OAuthLoginDto extends createZodDto(
  z.object({ accessToken: z.string().min(1) }),
) {}

/** Email/password login — admin/staff accounts only. */
export class EmailLoginDto extends createZodDto(
  z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
) {}

export class RefreshDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}

export class LogoutDto extends createZodDto(
  z.object({ refreshToken: z.string().min(1) }),
) {}
