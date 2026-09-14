/** Development environment: `apiBaseUrl` stays relative so the same build works
 * behind any host — OIDC settings still come from the runtime `/api/config`
 * endpoint, never from a compiled environment file. */
export const environment = {
  production: false,
  apiBaseUrl: '',
};
