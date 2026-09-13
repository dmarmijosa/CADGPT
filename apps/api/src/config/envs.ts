import 'dotenv/config';
import Joi from 'joi';

/** Environment variables read by the API process, validated once at load time. */
interface EnvVars {
  PORT: number;
  HOST: string;
  PUBLIC_ORIGIN: string;
  OIDC_ISSUER: string;
  OIDC_AUDIENCE: string;
  OIDC_JWKS_URL?: string;
  DATA_DIR?: string;
  NODE_ENV: 'development' | 'production' | 'test';
}

const envSchema = Joi.object<EnvVars>({
  PORT: Joi.number().default(3000),
  HOST: Joi.string().default('127.0.0.1'),
  PUBLIC_ORIGIN: Joi.string().uri().required(),
  OIDC_ISSUER: Joi.string().uri().required(),
  OIDC_AUDIENCE: Joi.string().required(),
  OIDC_JWKS_URL: Joi.string().uri(),
  DATA_DIR: Joi.string(),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
}).unknown(true);

/**
 * Validate and map a raw environment source into the typed, camelCase `envs` shape.
 * Accepts a custom `source` (instead of the live `process.env`) so callers — tests
 * in particular — can exercise validation without mutating global process state.
 */
export function loadEnvs(source: Record<string, string | undefined> = process.env) {
  const { error, value } = envSchema.validate(source);
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  const envVars = value as EnvVars;
  return {
    port: envVars.PORT,
    host: envVars.HOST,
    publicOrigin: envVars.PUBLIC_ORIGIN,
    oidcIssuer: envVars.OIDC_ISSUER,
    oidcAudience: envVars.OIDC_AUDIENCE,
    oidcJwksUrl: envVars.OIDC_JWKS_URL,
    dataDir: envVars.DATA_DIR,
    nodeEnv: envVars.NODE_ENV,
  };
}

export const envs = loadEnvs();
