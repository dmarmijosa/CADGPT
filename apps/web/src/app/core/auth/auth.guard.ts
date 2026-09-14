import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Functional guard (spec dashboard-routing "Auth Guard"). Waits for the auth
 * service to finish loading `/api/config` and checking any existing session
 * before deciding: an active user proceeds, otherwise the guard stores the
 * attempted URL and redirects to sign-in without rendering the route.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  await auth.ready();
  if (auth.user()) return true;
  auth.login(state.url);
  return false;
};
