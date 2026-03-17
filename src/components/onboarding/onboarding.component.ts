import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { TranslationService } from '../../services/translation.service';
import { User } from '../../models/user.model';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { AboutService } from '../../services/about.service';

@Component({
    selector: 'app-onboarding',
    imports: [CommonModule, ReactiveFormsModule, LanguageSelectorComponent],
    templateUrl: './onboarding.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
    authService = inject(AuthService);
    // FIX: Explicitly type `router` as `Router` to resolve type inference issue.
    router: Router = inject(Router);
    notificationService = inject(NotificationService);
    translationService = inject(TranslationService);
    aboutService = inject(AboutService);
    t = this.translationService.t;
    
    isSaving = signal(false);

    onboardingUser = this.authService.onboardingUser;
    
    onboardingForm = new FormGroup({
        name: new FormControl('', [Validators.required]),
        phone: new FormControl('', [Validators.required]),
        dailyRate: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
        newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
        confirmPassword: new FormControl('', [Validators.required]),
        address: new FormGroup({
            street: new FormControl('', [Validators.required]),
            number: new FormControl('', [Validators.required]),
            complement: new FormControl(''),
            neighborhood: new FormControl('', [Validators.required]),
            city: new FormControl('', [Validators.required]),
            state: new FormControl('', [Validators.required]),
            zipCode: new FormControl('', [Validators.required]),
        }),
        bankDetails: new FormGroup({
            bank: new FormControl('', [Validators.required]),
            agency: new FormControl('', [Validators.required]),
            account: new FormControl('', [Validators.required]),
            pixKey: new FormControl(''),
        }),
    }, { validators: this.passwordMatchValidator });

    ngOnInit(): void {
        if (!this.onboardingUser()) {
            this.router.navigate(['/login']);
        }
    }

    passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
        const newPassword = control.get('newPassword')?.value;
        const confirmPassword = control.get('confirmPassword')?.value;
        return newPassword === confirmPassword ? null : { passwordMismatch: true };
    }
    
    formatPhoneNumber(event: Event) {
      const input = event.target as HTMLInputElement;
      let digits = input.value.replace(/\D/g, '');
      if (digits.length > 11) {
        digits = digits.substring(0, 11);
      }
      
      let formattedValue = '';
      if (digits.length > 0) {
        formattedValue = '(' + digits.substring(0, 2);
      }
      if (digits.length > 2) {
        formattedValue += ') ' + digits.substring(2, 7);
      }
      if (digits.length > 7) {
        formattedValue += '-' + digits.substring(7, 11);
      }
      
      input.value = formattedValue;
    }

    onSubmit(): void {
        const user = this.onboardingUser();
        if (this.onboardingForm.invalid || !user) {
            this.onboardingForm.markAllAsTouched();
            return;
        }

        this.isSaving.set(true);
        const formValue = this.onboardingForm.getRawValue();

        const updateData: Partial<User> = {
            name: formValue.name as string,
            phone: formValue.phone as string,
            password: formValue.newPassword as string,
            dailyRate: formValue.dailyRate as number,
            address: formValue.address as any,
            bankDetails: formValue.bankDetails as any,
        };

        this.authService.completeOnboarding(user.id, updateData).subscribe({
            next: () => {
                this.notificationService.show('notifications.onboardingSuccess');
            },
            error: (err) => {
                this.notificationService.showError('notifications.onboardingError');
                console.error(err);
                this.isSaving.set(false);
            }
        });
    }
}
