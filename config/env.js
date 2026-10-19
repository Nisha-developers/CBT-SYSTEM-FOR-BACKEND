require('dotenv').config();
const { z } = require('zod');

const csv = (v) => String(v).split(',').map((s) => s.trim()).filter(Boolean);
const bool = (v) => String(v).toLowerCase() === 'true';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173').transform(csv),
VERCEL_ORIGIN: z.string().default('').transform(csv),

COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
COOKIE_SECURE: z.string().optional(),
TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  // Two different secrets, like the reference project: a stolen access token can never mint refresh tokens.
  ACCESS_TOKEN_SECRET: z.string().min(32, 'ACCESS_TOKEN_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().regex(/^\d+[smh]$/, 'e.g. 15m').default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  CLIENT_ORIGIN: z.string().default('http://localhost:5173').transform(csv),
  COOKIE_SAMESITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  COOKIE_SECURE: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  SCHOOL_TZ_OFFSET: z.string().regex(/^[+-]\d{2}:\d{2}$/).default('+01:00'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  parsed.error.issues.forEach((i) => console.error(`  - ${i.path.join('.')}: ${i.message}`));
  process.exit(1);
}


const env = parsed.data;
if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET) {
  console.error('ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be different.');
  process.exit(1);
}
env.isProd = env.NODE_ENV === 'production';
env.COOKIE_SECURE = env.COOKIE_SECURE === undefined ? env.isProd : bool(env.COOKIE_SECURE);
if (env.COOKIE_SAMESITE === 'none' && !env.COOKIE_SECURE) {
  console.error('COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise).');
  process.exit(1);
}

module.exports = env;
