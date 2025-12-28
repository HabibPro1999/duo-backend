import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  CORS_ORIGIN: z.string().default('*'),
  // Firebase
  FIREBASE_PROJECT_ID: z.string(),
  FIREBASE_STORAGE_BUCKET: z.string(),
  // Firebase service account JSON (for cloud deployments)
  FIREBASE_SERVICE_ACCOUNT: z.string().optional(),
});

const env = envSchema.parse(process.env);

export const config = {
  ...env,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  database: {
    poolSize: env.NODE_ENV === 'production' ? 20 : 5,
  },
  security: {
    rateLimit: {
      max: env.NODE_ENV === 'production' ? 100 : 1000,
      timeWindow: '1 minute',
    },
  },
  firebase: {
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
    serviceAccount: env.FIREBASE_SERVICE_ACCOUNT,
  },
};
