import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { AuthService } from './services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  // FIX: Explicitly type `router` as `Router` to resolve type inference issue.
  const router: Router = inject(Router);

  if (authService.currentUser()) {
    return true;
  }
  
  return router.parseUrl('/login');
};

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./components/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./components/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password/:token',
    loadComponent: () => import('./components/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./components/onboarding/onboarding.component').then(m => m.OnboardingComponent),
  },
  {
    path: 'portal',
    loadComponent: () => import('./components/portal/portal.component').then(m => m.PortalComponent),
    canActivate: [authGuard],
  },
  { path: '', redirectTo: 'portal', pathMatch: 'full' },
  { path: '**', redirectTo: 'portal' },
];