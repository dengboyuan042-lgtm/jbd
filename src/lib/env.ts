import { z } from 'zod';

/**
 * Centralised, validated runtime configuration.
 * Nothing else in the codebase reads `process.env` directly.
 */
const schema = z.object({
  APP_NAME: z.string().default('AskSia Pro'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  AUTH_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  /**
   * Session cookie policy. Use 'none' when the app is embedded in a
   * cross-origin iframe (preview shells, embedded dashboards); the cookie is
   * then forced to Secure, so it still requires HTTPS.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /**
   * Close public sign-up once the owner's account exists. The instance then
   * only admits people who already have credentials; new accounts must be
   * provisioned with `npm run account:create`.
   */
  ALLOW_SIGNUP: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  DATABASE_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  DATABASE_URL: z.string().optional(),
  PGLITE_DATA_DIR: z.string().default('./.data/pglite'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./.data/storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  AI_DRIVER: z
    .enum(['openai', 'anthropic', 'google', 'openai-compatible', 'local'])
    .default('local'),
  AI_CHAT_MODEL: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().default('https://api.anthropic.com/v1'),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_BASE_URL: z
    .string()
    .default('https://generativelanguage.googleapis.com/v1beta'),

  EMBEDDING_DRIVER: z.enum(['provider', 'local']).default('local'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),

  SPEECH_DRIVER: z
    .enum(['openai-whisper', 'deepgram', 'browser', 'local'])
    .default('local'),
  DEEPGRAM_API_KEY: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (!cached) cached = load();
  return cached;
}

export type Env = z.infer<typeof schema>;

/** Which optional capabilities are actually wired up right now. */
export function capabilities() {
  const e = env();
  return {
    aiDriver: e.AI_DRIVER,
    aiLive: e.AI_DRIVER !== 'local',
    embeddingDriver: e.EMBEDDING_DRIVER,
    speechDriver: e.SPEECH_DRIVER,
    speechLive: e.SPEECH_DRIVER !== 'local',
    storageDriver: e.STORAGE_DRIVER,
    databaseDriver: e.DATABASE_DRIVER,
    allowSignup: e.ALLOW_SIGNUP,
  } as const;
}
