import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { JobService } from '../../../services/job.service';
import { NotificationService } from '../../../services/notification.service';
import { Company } from '../../../models/company.model';
import { TranslationService } from '../../../services/translation.service';
import { debounceTime } from 'rxjs/operators';
import { ConfirmationModalComponent } from '../../confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-manage-companies',
  imports: [CommonModule, ReactiveFormsModule, CurrencyPipe, ConfirmationModalComponent],
  templateUrl: './manage-companies.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageCompaniesComponent {
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;

  public editingCompany = signal<Company | null>(null);
  public companyToDelete = signal<Company | null>(null);

  // Filter state
  public isFilterPanelVisible = signal(false);
  public filterForm = new FormGroup({
    name: new FormControl(''),
    contact: new FormControl(''),
    email: new FormControl(''),
    location: new FormControl(''),
    contractType: new FormControl('all'),
  });
  public filterValues = signal(this.filterForm.value);

  public visibleCompanies = computed(() => {
    const companies = this.jobService.companies();
    const filters = this.filterValues();
    
    const nameFilter = (filters.name ?? '').toLowerCase().trim();
    const contactFilter = (filters.contact ?? '').toLowerCase().trim();
    const emailFilter = (filters.email ?? '').toLowerCase().trim();
    const locationFilter = (filters.location ?? '').toLowerCase().trim();
    const contractTypeFilter = filters.contractType;

    if (!nameFilter && !contactFilter && !emailFilter && !locationFilter && contractTypeFilter === 'all') {
      return companies;
    }

    return companies.filter(company => {
      const nameMatch = nameFilter ? company.name.toLowerCase().includes(nameFilter) : true;
      const contactMatch = contactFilter ? (company.contactName ?? '').toLowerCase().includes(contactFilter) : true;
      const emailMatch = emailFilter ? (company.email ?? '').toLowerCase().includes(emailFilter) : true;
      const locationMatch = locationFilter 
        ? ((company.city ?? '').toLowerCase().includes(locationFilter) || (company.state ?? '').toLowerCase().includes(locationFilter))
        : true;
      const contractTypeMatch = contractTypeFilter !== 'all' ? company.contractType === contractTypeFilter : true;

      return nameMatch && contactMatch && emailMatch && locationMatch && contractTypeMatch;
    });
  });

  public title = computed(() => {
    const company = this.editingCompany();
    return company ? this.t()('manageCompanies.editTitle', { name: company.name }) : this.t()('manageCompanies.newTitle');
  });

  public companyForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2)]),
    address: new FormControl(''),
    city: new FormControl(''),
    state: new FormControl(''),
    phone1: new FormControl('', [Validators.required]),
    phone2: new FormControl(''),
    email: new FormControl('', [Validators.required, Validators.email]),
    contactName: new FormControl('', [Validators.required]),
    contractType: new FormControl<'monthly' | 'anual' | 'other' | null>(null, [Validators.required]),
    contractValue: new FormControl<number | null>(null, [Validators.required, Validators.min(0)]),
    bannerImageUrl: new FormControl(''),
    defaultStartTime: new FormControl(''),
    defaultEndTime: new FormControl(''),
    maxMonthlyHiresPerUser: new FormControl<number | null>(null, [Validators.min(0)]),
  });

  constructor() {
    this.filterForm.valueChanges.pipe(
      debounceTime(300)
    ).subscribe(values => {
      this.filterValues.set(values);
    });
  }

  resetFilters() {
    this.filterForm.reset({
      name: '',
      contact: '',
      email: '',
      location: '',
      contractType: 'all',
    });
  }

  onSubmit() {
    if (this.companyForm.invalid) {
      return;
    }

    const formValue = this.companyForm.getRawValue();
    const companyData: Omit<Company, 'id'> = {
        name: formValue.name!,
        contactName: formValue.contactName!,
        email: formValue.email!,
        phone1: formValue.phone1!,
        contractType: formValue.contractType!,
        contractValue: formValue.contractValue!,
        address: formValue.address || undefined,
        city: formValue.city || undefined,
        state: formValue.state || undefined,
        phone2: formValue.phone2 || undefined,
        bannerImageUrl: formValue.bannerImageUrl || undefined,
        defaultStartTime: formValue.defaultStartTime || undefined,
        defaultEndTime: formValue.defaultEndTime || undefined,
        maxMonthlyHiresPerUser: formValue.maxMonthlyHiresPerUser ?? undefined,
    };

    const currentlyEditing = this.editingCompany();
    
    if (currentlyEditing) {
      this.jobService.updateCompany(currentlyEditing.id, companyData).subscribe({
        next: () => this.cancelEdit()
      });
    } else {
      this.jobService.addCompany(companyData).subscribe({
        next: () => this.cancelEdit()
      });
    }
  }

  editCompany(company: Company) {
    this.editingCompany.set(company);
    this.companyForm.patchValue({ 
      ...company,
      bannerImageUrl: company.bannerImageUrl || ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteCompany(company: Company) {
    this.companyToDelete.set(company);
  }

  confirmDeleteCompany() {
    const company = this.companyToDelete();
    if (company) {
      this.jobService.deleteCompany(company.id).subscribe({
        next: () => this.companyToDelete.set(null),
        error: () => this.companyToDelete.set(null), // Also close modal on error
      });
    }
  }

  cancelEdit() {
    this.editingCompany.set(null);
    this.companyForm.reset();
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
        this.companyForm.get('bannerImageUrl')?.setValue(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }
}
