import { Component, ChangeDetectionStrategy, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { JobService } from '../../../services/job.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { Company } from '../../../models/company.model';
import { TranslationService } from '../../../services/translation.service';

@Component({
  selector: 'app-manage-company-profile',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-company-profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageCompanyProfileComponent {
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;
  
  public currentUser = this.authService.currentUser;
  
  public selectedCompanyId = signal<string | null>(null);

  public managedCompanies = computed<Company[]>(() => {
    const user = this.currentUser();
    if (!user || !Object.values(user.rolesByCompany ?? {}).includes('company-admin')) {
        return [];
    }
    
    const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
      (id) => user.rolesByCompany![id] === 'company-admin'
    );

    return this.jobService.companies().filter((c) => adminCompanyIds.includes(c.id));
  });
  
  public selectedCompany = computed<Company | null>(() => {
    const id = this.selectedCompanyId();
    if (!id) {
      return null;
    }
    return this.managedCompanies().find(c => c.id === id) ?? null;
  });

  public companyProfileForm = new FormGroup({
    bannerImageUrl: new FormControl(''),
    defaultStartTime: new FormControl(''),
    defaultEndTime: new FormControl(''),
    maxMonthlyHiresPerUser: new FormControl<number | null>(null, [Validators.min(0)]),
  });

  constructor() {
    effect(() => {
      // Auto-select company if there's only one for the admin
      const companies = this.managedCompanies();
      if (companies.length === 1 && this.selectedCompanyId() !== companies[0].id) {
        this.selectedCompanyId.set(companies[0].id);
      }

      // Patch form with selected company data
      const company = this.selectedCompany();
      if (company) {
        this.companyProfileForm.patchValue({
          bannerImageUrl: company.bannerImageUrl || '',
          defaultStartTime: company.defaultStartTime || '',
          defaultEndTime: company.defaultEndTime || '',
          maxMonthlyHiresPerUser: company.maxMonthlyHiresPerUser ?? null,
        });
      } else {
        // If no company is selected (or selection is cleared), reset the form
        this.companyProfileForm.reset();
      }
    });
  }
  
  onCompanySelect(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    this.selectedCompanyId.set(selectElement.value !== 'null' ? selectElement.value : null);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
          this.notificationService.showError('notifications.imageTooLarge', 5000);
          return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.companyProfileForm.get('bannerImageUrl')?.setValue(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    const company = this.selectedCompany();
    if (!company) return;

    const formValue = this.companyProfileForm.getRawValue();
    const { id, ...companyWithoutId } = company;

    const companyData: Omit<Company, 'id'> = {
      ...companyWithoutId,
      bannerImageUrl: formValue.bannerImageUrl || undefined,
      defaultStartTime: formValue.defaultStartTime || undefined,
      defaultEndTime: formValue.defaultEndTime || undefined,
      maxMonthlyHiresPerUser: formValue.maxMonthlyHiresPerUser ?? undefined,
    };
    
    // Fix: Subscribe to the observable to trigger the action.
    // The service handles notifications.
    this.jobService.updateCompany(company.id, companyData).subscribe();
  }
}
