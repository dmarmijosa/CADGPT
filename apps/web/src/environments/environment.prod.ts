/** Production environment: `apiBaseUrl` stays relative so one built image serves
 * every deployment host — OIDC settings still come from the runtime `/api/config`
 * endpoint, never from a compiled environment file. */
export const environment = {
  production: true,
  apiBaseUrl: '',
};
