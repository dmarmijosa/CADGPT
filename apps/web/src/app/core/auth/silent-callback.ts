/**
 * Silent sign-in callback (`prompt=none` in a hidden iframe).
 *
 * `AuthService` reuses the already-registered `/callback` redirect URI as the
 * silent redirect URI, so the Keycloak realm needs no extra entry. When that
 * page loads inside the hidden iframe it must NOT bootstrap Angular — the
 * callback route would consume the authorization code with
 * `signinRedirectCallback()`. Instead it hands the URL straight to the parent
 * window using the message shape `oidc-client-ts` (v3) listens for
 * (`IFrameWindow.notifyParent`): `{ source: 'oidc-client', url, keepOpen }`,
 * posted only to this page's own origin.
 *
 * @returns true when the page was a silent callback (the caller must then
 * skip bootstrapping the app).
 */
export function notifyParentIfSilentCallback(win: Window = window): boolean {
  if (win.parent === win || win.location.pathname !== '/callback') return false;
  win.parent.postMessage(
    { source: 'oidc-client', url: win.location.href, keepOpen: false },
    win.location.origin,
  );
  return true;
}
