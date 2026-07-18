import { z } from 'zod';

const envSchema = z.object({
  APP_ENV: z
    .string()
    .optional()
    .transform((v) => {
      const cleaned = (v ?? 'development').trim().toLowerCase();
      if (
        cleaned === 'development' ||
        cleaned === 'preview' ||
        cleaned === 'production' ||
        cleaned === 'test'
      ) {
        return cleaned;
      }
      if (cleaned === 'prod') return 'production';
      return 'production';
    }),
  APP_URL: z.string().optional().default('http://localhost:3001'),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_ORIGINS: z.string().min(1).default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  // Kinde
  KINDE_ISSUER_URL: z.string().optional(),
  KINDE_AUDIENCE: z.string().optional(),
  LOG_LEVEL: z.string().default('log'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL_ID: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  SETTLEMENT_EXPIRE_DAYS: z.coerce.number().int().positive().default(14),
});

export type AppEnv = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): AppEnv {
  if (!config.GEMINI_MODEL_ID && config.GEMINI_MODEL) {
    config.GEMINI_MODEL_ID = config.GEMINI_MODEL;
  }
  if (!config.APP_ENV && config.VERCEL_ENV) {
    config.APP_ENV = config.VERCEL_ENV;
  }
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }
  return parsed.data;
}

export function parseOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
