/** Permit OIDC discovery/token requests on the configured issuer origin only. */
export function browserSecurityPolicy(issuer: string) {
  const url = new URL(issuer);
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('OIDC issuer requires HTTPS except for loopback development.');
  }
  if (url.username || url.password) {
    throw new Error('OIDC issuer must not contain credentials.');
  }
  return {
    directives: {
      connectSrc: ["'self'", url.origin],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
    },
  };
}
