import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

/**
 * Route table (design "Web Architecture"). `''`/`about`/`callback` stay
 * public; every other route requires an active OIDC session via
 * `authGuard`. Every page is lazy-loaded so its module only downloads on
 * navigation (spec dashboard-routing "Lazy route loads on navigation").
 */
export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then((m) => m.HomePage) },
  { path: 'about', loadComponent: () => import('./pages/about/about').then((m) => m.AboutPage) },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback').then((m) => m.CallbackPage),
  },
  {
    path: 'pair',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/pair/pair').then((m) => m.PairPage),
  },
  {
    path: 'connect',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/connect/connect').then((m) => m.ConnectPage),
  },
  {
    path: 'keys',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/keys/keys').then((m) => m.KeysPage),
  },
  {
    path: 'devices',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/devices/devices').then((m) => m.DevicesPage),
  },
  {
    path: 'designs',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/designs/designs').then((m) => m.DesignsPage),
  },
  {
    path: 'designs/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/design-detail/design-detail').then((m) => m.DesignDetailPage),
  },
  {
    path: 'jobs',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/jobs/jobs').then((m) => m.JobsPage),
  },
  { path: '**', redirectTo: '' },
];
