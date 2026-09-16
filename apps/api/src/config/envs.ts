import 'dotenv/config';
import { z } from 'zod';

/** Environment variables read by the API process, validated once at load time using Zod. */
const envSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('127.0.0.1'),
    PUBLIC_ORIGIN: z.string().url(),
    OIDC_ISSUER: z.string().url(),
    OIDC_AUDIENCE: z.string().min(1),
    OIDC_JWKS_URL: z.string().url().optional(),
    DATA_DIR: z.string().optional(),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    KEYCLOAK_BASE_URL: z.string().url().optional(),
    KEYCLOAK_REALM: z.string().optional(),
    KEYCLOAK_ADMIN_USERNAME: z.string().optional(),
    KEYCLOAK_ADMIN_PASSWORD: z.string().optional(),
    KEYCLOAK_ADMIN_CLIENT_ID: z.string().optional(),
    KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().optional(),
  })
  .passthrough();

/**
 * Validate and map a raw environment source into the typed, camelCase `envs` shape.
 * Accepts a custom `source` (instead of the live `process.env`) so callers — tests
 * in particular — can exercise validation without mutating global process state.
 */
export function loadEnvs(source: Record<string, string | undefined> = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Config validation error: ${msg}`);
  }
  const envVars = parsed.data;
  return {
    port: envVars.PORT,
    host: envVars.HOST,
    publicOrigin: envVars.PUBLIC_ORIGIN,
    oidcIssuer: envVars.OIDC_ISSUER,
    oidcAudience: envVars.OIDC_AUDIENCE,
    oidcJwksUrl: envVars.OIDC_JWKS_URL,
    dataDir: envVars.DATA_DIR,
    nodeEnv: envVars.NODE_ENV,
    keycloakBaseUrl: envVars.KEYCLOAK_BASE_URL,
    keycloakRealm: envVars.KEYCLOAK_REALM,
    keycloakAdminUsername: envVars.KEYCLOAK_ADMIN_USERNAME,
    keycloakAdminPassword: envVars.KEYCLOAK_ADMIN_PASSWORD,
    keycloakAdminClientId: envVars.KEYCLOAK_ADMIN_CLIENT_ID,
    keycloakAdminClientSecret: envVars.KEYCLOAK_ADMIN_CLIENT_SECRET,
  };
}

export const envs = loadEnvs();
