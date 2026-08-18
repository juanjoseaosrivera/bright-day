import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';
import { subscriptionGuard } from './core/guards/subscription.guard';

export const routes: Routes = [
  // ── Public pages (no layout) ───────────────────────────────────────────────
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/pages/home.page').then((m) => m.HomePage),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/pages/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'auth/verify-email',
    loadComponent: () =>
      import('./features/auth/pages/email-verification.page').then(
        (m) => m.EmailVerificationPage,
      ),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/pages/onboarding.page').then((m) => m.OnboardingPage),
  },

  // ── Authenticated pages (wrapped in MainLayout) ────────────────────────────
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shared/layouts/main-layout').then((m) => m.MainLayout),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'diary',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/diary/pages/diary-list.page').then((m) => m.DiaryListPage),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/diary/pages/diary-editor.page').then((m) => m.DiaryEditorPage),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/diary/pages/diary-detail.page').then((m) => m.DiaryDetailPage),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/diary/pages/diary-editor.page').then((m) => m.DiaryEditorPage),
          },
        ],
      },
      {
        path: 'sessions',
        canActivate: [subscriptionGuard],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/sessions/pages/session-history.page').then(
                (m) => m.SessionHistoryPage,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/sessions/pages/session.page').then((m) => m.SessionPage),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./features/sessions/pages/session-detail.page').then(
                (m) => m.SessionDetailPage,
              ),
          },
        ],
      },
      {
        path: 'subscription',
        loadComponent: () =>
          import('./features/subscription/pages/subscription.page').then(
            (m) => m.SubscriptionPage,
          ),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
