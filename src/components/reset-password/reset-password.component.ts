import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AboutService } from '../../services/about.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-reset-password',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, LanguageSelectorComponent],
  templateUrl: './reset-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordComponent implements OnInit {
  authService = inject(AuthService);
  // FIX: Explicitly type `router` as `Router` to resolve type inference issue.
  router: Router = inject(Router);
  // FIX: Explicitly type `route` as `ActivatedRoute` to resolve type inference issue.
  route: ActivatedRoute = inject(ActivatedRoute);
  translationService = inject(TranslationService);
  notificationService = inject(NotificationService);
  aboutService = inject(AboutService);
  t = this.translationService.t;

  isSubmitting = signal(false);
  tokenError = signal<string | null>(null);
  resetToken = signal<string | null>(null);
  
  resetPasswordForm = new FormGroup({
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required]),
  }, { validators: this.passwordMatchValidator });

  ngOnInit(): void {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.tokenError.set(this.t()('resetPassword.tokenError'));
    } else {
      this.resetToken.set(token);
    }
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { mismatchError: true };
  }

  onSubmit(): void {
    const token = this.resetToken();
    if (this.resetPasswordForm.invalid || this.isSubmitting() || !token) {
      return;
    }

    this.isSubmitting.set(true);
    this.tokenError.set(null);
    const { newPassword } = this.resetPasswordForm.value;

    this.authService.resetPasswordWithToken(token, newPassword!).subscribe({
      next: () => {
        this.notificationService.show('notifications.passwordUpdateSuccess');
        this.router.navigate(['/login']);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.tokenError.set(this.t()('resetPassword.tokenError'));
      }
    });
  }
}
