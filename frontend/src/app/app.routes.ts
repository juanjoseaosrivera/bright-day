import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'register',
    loadComponent: () => import('./features/auth/pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login.page').then((m) => m.LoginPage),
  },
  {
    // Supabase email-verification redirect target.
    path: 'auth/verify-email',
    loadComponent: () =>
      import('./features/auth/pages/email-verification.page').then((m) => m.EmailVerificationPage),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/pages/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/home/pages/home.page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
