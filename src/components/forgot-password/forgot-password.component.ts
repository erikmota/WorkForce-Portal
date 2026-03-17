import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AboutService } from '../../services/about.service';

@Component({
  selector: 'app-forgot-password',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, LanguageSelectorComponent],
  templateUrl: './forgot-password.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ForgotPasswordComponent {
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  aboutService = inject(AboutService);
  t = this.translationService.t;

  isSubmitting = signal(false);
  messageSent = signal(false);
  
  forgotPasswordForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
  });

  onSubmit(): void {
    if (this.forgotPasswordForm.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    const { email } = this.forgotPasswordForm.value;

    this.authService.requestPasswordReset(email!).subscribe({
      // We always show the same message to prevent email enumeration.
      complete: () => {
        this.isSubmitting.set(false);
        this.messageSent.set(true);
        this.forgotPasswordForm.reset();
      }
    });
  }
}
