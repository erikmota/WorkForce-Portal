import { Component, ChangeDetectionStrategy, input, output, signal, inject, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';
import { JobService } from '../../services/job.service';
import { Company } from '../../models/company.model';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-profile-modal',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileModalComponent {
  public user = input.required<User>();
  
  public close = output<void>();
  public userUpdated = output<User>();

  public authService = inject(AuthService);
  public notificationService = inject(NotificationService);
  public jobService = inject(JobService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;

  public activeTab = signal<'profile' | 'personalData' | 'security'>('profile');
  public profilePicturePreview = signal<string | null>(null);
  public allSkills = this.jobService.skills;
  
  public userProfileForm = new FormGroup({
    name: new FormControl('', Validators.required),
    phone: new FormControl(''),
    dailyRate: new FormControl<number | null>(null, [Validators.min(0)]),
    address: new FormGroup({
      street: new FormControl(''),
      number: new FormControl(''),
      complement: new FormControl(''),
      neighborhood: new FormControl(''),
      city: new FormControl(''),
      state: new FormControl(''),
      zipCode: new FormControl(''),
    }),
    bankDetails: new FormGroup({
      bank: new FormControl(''),
      agency: new FormControl(''),
      account: new FormControl(''),
      pixKey: new FormControl(''),
    }),
  });

  public passwordForm = new FormGroup({
    currentPassword: new FormControl('', Validators.required),
    newPassword: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', Validators.required),
  }, { validators: this.passwordMatchValidator });
  
  public userCompanies = computed<Company[]>(() => {
    const currentUser = this.user();
    if (!currentUser.companyIds || currentUser.companyIds.length === 0) {
        return [];
    }
    return this.jobService.companies().filter(c => currentUser.companyIds!.includes(c.id));
  });

  public companyDetails = computed(() => {
    const user = this.user();
    const companies = this.userCompanies();
    if (user.isGlobalAdmin || !user.companyIds) return [];

    return companies
      .map(company => ({
        id: company.id,
        name: company.name,
        status: user.statusByCompany?.[company.id] || 'active',
        skills: user.skillsByCompany?.[company.id] || [],
        role: user.rolesByCompany?.[company.id] === 'company-admin'
          ? this.t()('registerUser.roles.companyAdmin')
          : this.t()('registerUser.roles.user')
      }))
      .sort((a, b) => {
        if (a.status === 'active' && b.status === 'inactive') return -1;
        if (a.status === 'inactive' && b.status === 'active') return 1;
        return a.name.localeCompare(b.name);
      });
  });

  public generalRole = computed(() => {
    const user = this.user();
    if (user.isGlobalAdmin) return this.t()('registerUser.roles.admin');
    return null;
  });

  constructor() {
    effect(() => {
      const user = this.user();
      this.profilePicturePreview.set(user.profilePictureUrl || null);
      this.userProfileForm.patchValue({
        name: user.name,
        phone: user.phone || '',
        dailyRate: user.dailyRate ?? null,
        address: user.address || {},
        bankDetails: user.bankDetails || {},
      });

      const isCompanyAdmin = Object.values(user.rolesByCompany ?? {}).includes('company-admin');
      const isEndUser = !user.isGlobalAdmin && !isCompanyAdmin;

      if (isEndUser) {
        this.userProfileForm.get('dailyRate')?.disable();
      } else {
        this.userProfileForm.get('dailyRate')?.enable();
      }
    });
  }

  setTab(tab: 'profile' | 'personalData' | 'security'): void {
    this.activeTab.set(tab);
  }

  public passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => this.profilePicturePreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    }
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

  saveProfile(): void {
    if (this.userProfileForm.invalid) {
        return;
    }
    const currentUser = this.user();
    const formValue = this.userProfileForm.getRawValue();

    const updatedUser: User = {
      ...currentUser,
      name: formValue.name!,
      phone: formValue.phone || '',
      dailyRate: formValue.dailyRate ?? undefined,
      profilePictureUrl: this.profilePicturePreview() || '',
      address: formValue.address as any,
      bankDetails: formValue.bankDetails as any,
      skillsByCompany: currentUser.skillsByCompany, // Pass skills through unchanged
    };
    
    this.userUpdated.emit(updatedUser);
  }

  changePassword(): void {
      if (this.passwordForm.invalid) {
        return;
      }
      const { currentPassword, newPassword } = this.passwordForm.value;
      this.authService.changePassword(this.user().id, currentPassword!, newPassword!).subscribe({
        next: () => {
          this.notificationService.show('notifications.passwordUpdateSuccess');
          this.passwordForm.reset();
        },
        error: () => {
          this.notificationService.showError('notifications.passwordUpdateErrorMatch');
        }
      });
  }

  onClose(): void {
    this.close.emit();
  }
}
