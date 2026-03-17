import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
// Fix: Swapped FormBuilder for FormGroup and FormControl to resolve a type error during form creation.
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AboutService } from '../../services/about.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, LanguageSelectorComponent],
  template: `
<div class="min-h-screen flex flex-col lg:flex-row bg-gray-50">
  
  <!-- Image Panel -->
  <div class="relative w-full h-48 lg:w-1/2 lg:h-screen">
    <img class="h-full w-full object-cover" [src]="aboutService.aboutImageUrl()" alt="Application banner">
  </div>
  
  <!-- Form Panel -->
  <div class="w-full lg:w-1/2 flex flex-col py-8 px-4 sm:px-6 lg:px-20 xl:px-24 relative">
    <div class="absolute top-4 right-4 z-10">
      <app-language-selector></app-language-selector>
    </div>

    <div class="flex-grow flex flex-col justify-center">
        <div class="mx-auto w-full max-w-sm lg:w-96">
        <div>
            <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
            {{ t()('login.title') }}
            </h2>
        </div>
        <div class="mt-8">
            <form class="space-y-6" [formGroup]="loginForm" (ngSubmit)="onSubmit()">
            <div class="rounded-md shadow-sm -space-y-px">
                <div>
                <label for="username" class="sr-only">Email</label>
                <input id="username" name="username" type="email" formControlName="username" required class="appearance-none rounded-none relative block w-full px-3 py-2 border-0 text-gray-900 rounded-t-md shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-600 focus:z-10 sm:text-sm" [placeholder]="t()('login.usernamePlaceholder')">
                </div>
                <div>
                <label for="password" class="sr-only">Password</label>
                <input id="password" name="password" type="password" formControlName="password" required class="appearance-none rounded-none relative block w-full px-3 py-2 border-0 text-gray-900 rounded-b-md shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-600 focus:z-10 sm:text-sm" [placeholder]="t()('login.passwordPlaceholder')">
                </div>
            </div>

            <div class="text-sm">
                <a routerLink="/forgot-password" class="font-medium text-indigo-600 hover:text-indigo-500">{{ t()('login.forgotPassword') }}</a>
            </div>

            @if (loginError()) {
                <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                <span class="block sm:inline">{{ loginError() }}</span>
                </div>
            }

            <div>
                <button type="submit" [disabled]="loginForm.invalid" class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300">
                {{ t()('login.signInButton') }}
                </button>
            </div>
            </form>
        </div>
        </div>
    </div>
    
    <footer class="text-center pt-8">
        <p class="text-xs text-gray-500">
            &copy; {{ currentYear }} Workforce Portal. All Rights Reserved. by ERIK MOTA
        </p>
    </footer>
  </div>
</div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private authService = inject(AuthService);
  // FIX: Explicitly type `router` as `Router` to resolve type inference issue.
  private router: Router = inject(Router);
  translationService = inject(TranslationService);
  aboutService = inject(AboutService);
  t = this.translationService.t;
  currentYear = new Date().getFullYear();

  // Fix: Replaced FormBuilder.group with new FormGroup to fix "Property 'group' does not exist on type 'unknown'" error.
  loginForm = new FormGroup({
    username: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('password', Validators.required),
  });

  loginError = signal<string | null>(null);
  isLoggingIn = signal(false);

  onSubmit(): void {
    if (this.loginForm.valid && !this.isLoggingIn()) {
      this.isLoggingIn.set(true);
      this.loginError.set(null);
      const { username, password } = this.loginForm.value;
      
      this.authService.login(username!, password!).subscribe({
        next: (user) => {
          if (user.needsOnboarding) {
            this.router.navigate(['/onboarding']);
          } else {
            this.router.navigate(['/portal']);
          }
        },
        error: (err) => {
          if (err.message === 'Account is inactive') {
            this.loginError.set(this.t()('login.inactiveAccountError'));
          } else {
            this.loginError.set(this.t()('login.invalidCredentialsError'));
          }
          this.isLoggingIn.set(false);
        },
        complete: () => {
          this.isLoggingIn.set(false);
        }
      });
    }
  }
}