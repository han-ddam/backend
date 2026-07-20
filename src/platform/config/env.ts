import { z } from 'zod';

/**
 * Single source of validated configuration. Parsed once at startup;
 * a missing/invalid var fails fast with a clear message.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(1209600),

  // 구글 ID token aud 허용목록 (콤마구분). 미설정이면 구글 로그인 거부(fail-closed). 카카오/네이버 무관.
  GOOGLE_CLIENT_ID: z.string().optional(),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.0-flash'),
  COMPOSITION_COUNT: z.coerce.number().int().min(1).max(10).default(3),

  // CORS allowlist: '*' (reflect any origin) or comma-separated origins.
  CORS_ORIGINS: z.string().default('*'),

  PROXIMITY_TOLERANCE_M: z.coerce.number().positive().default(150),

  // 인증 사진 로컬 저장 디렉터리 (도커 볼륨 마운트 지점).
  STORAGE_DIR: z.string().default('/app/uploads'),

  // Swagger는 production에서 기본 off. tunnel/스테이징에서 문서 UI가 필요하면 1로.
  ENABLE_SWAGGER: z
    .enum(['true', 'false', '1', '0'])
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof envSchema>;

/** Used by @nestjs/config `validate`. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n')}`,
    );
  }
  return parsed.data;
}
