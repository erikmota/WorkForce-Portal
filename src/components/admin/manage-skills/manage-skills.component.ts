import { Component, ChangeDetectionStrategy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { JobService } from '../../../services/job.service';
import { NotificationService } from '../../../services/notification.service';
import { Skill } from '../../../models/skill.model';
import { TranslationService } from '../../../services/translation.service';
import { debounceTime } from 'rxjs/operators';
import { ConfirmationModalComponent } from '../../confirmation-modal/confirmation-modal.component';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-manage-skills',
  imports: [CommonModule, ReactiveFormsModule, ConfirmationModalComponent],
  templateUrl: './manage-skills.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageSkillsComponent {
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public translationService = inject(TranslationService);
  public authService = inject(AuthService);
  public t = this.translationService.t;

  public currentUser = this.authService.currentUser;
  public editingSkill = signal<Skill | null>(null);
  public skillToDelete = signal<Skill | null>(null);

  // Filter state
  public isFilterPanelVisible = signal(false);
  public filterForm = new FormGroup({
    name: new FormControl(''),
    companyId: new FormControl('all'),
  });
  public filterValues = signal(this.filterForm.value);

  public availableCompanies = computed(() => {
    const user = this.currentUser();
    const allCompanies = this.jobService.companies();

    if (user && !user.isGlobalAdmin) {
      const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
        id => user.rolesByCompany![id] === 'company-admin'
      );
      return allCompanies.filter(c => adminCompanyIds.includes(c.id));
    }
    
    return allCompanies; // Super admin sees all
  });

  public areFiltersActive = computed(() => {
    const filters = this.filterValues();
    return (
        (filters.name ?? '').trim() !== '' ||
        filters.companyId !== 'all'
    );
  });

  public showCompanyDropdown = computed(() => {
    const user = this.currentUser();
    if (user?.isGlobalAdmin) {
      return true; // Admins always see the dropdown
    }
    if (user && !user.isGlobalAdmin && Object.values(user.rolesByCompany ?? {}).includes('company-admin')) {
      return this.availableCompanies().length > 1; // Company admins see it only if they manage more than one company
    }
    return true; // Default case
  });

  public visibleSkills = computed(() => {
    const skills = this.jobService.skills();
    const filters = this.filterValues();
    const nameFilter = (filters.name ?? '').toLowerCase().trim();
    const companyFilter = filters.companyId;

    let roleFilteredSkills = skills;
    const user = this.currentUser();
    if (user && !user.isGlobalAdmin) {
        const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
          id => user.rolesByCompany![id] === 'company-admin'
        );
        roleFilteredSkills = skills.filter(skill => adminCompanyIds.includes(skill.companyId));
    }

    if (!nameFilter && companyFilter === 'all') {
      return roleFilteredSkills;
    }

    return roleFilteredSkills.filter(skill => {
      const nameMatch = nameFilter ? skill.name.toLowerCase().includes(nameFilter) : true;
      const companyMatch = companyFilter !== 'all' ? skill.companyId === companyFilter : true;
      return nameMatch && companyMatch;
    });
  });

  public title = computed(() => {
    const skill = this.editingSkill();
    return skill ? this.t()('manageSkills.editTitle', { name: skill.name }) : this.t()('manageSkills.newTitle');
  });

  public skillForm = new FormGroup({
    name: new FormControl('', [Validators.required, Validators.minLength(2)]),
    companyId: new FormControl<string | null>(null, Validators.required),
  });

  constructor() {
    this.filterForm.valueChanges.pipe(
      debounceTime(300)
    ).subscribe(values => {
      this.filterValues.set(values);
    });

    effect(() => {
      const skill = this.editingSkill();
      if (skill) {
        // Editing an existing skill
        this.skillForm.patchValue({ 
          name: skill.name,
          companyId: skill.companyId,
        });
        this.skillForm.get('companyId')?.disable();
      } else {
        // Entering "create" mode
        this.resetFormToCreateState();
      }
    });
  }

  private resetFormToCreateState() {
    const companies = this.availableCompanies();
    const user = this.currentUser();
    const isCompanyAdmin = user && !user.isGlobalAdmin && Object.values(user.rolesByCompany ?? {}).includes('company-admin');
    
    let defaultCompanyId: string | null = null;
    if (companies.length === 1 && isCompanyAdmin) {
      defaultCompanyId = companies[0].id;
    }
    
    this.skillForm.reset({
      name: '',
      companyId: defaultCompanyId
    });
    this.skillForm.get('companyId')?.enable();
  }

  resetFilters() {
    this.filterForm.reset({ name: '', companyId: 'all' });
  }

  onSubmit() {
    if (this.skillForm.invalid) {
      return;
    }
    const formValue = this.skillForm.getRawValue();
    const skillName = formValue.name!;
    const companyId = formValue.companyId!;

    const currentlyEditing = this.editingSkill();
    
    if (currentlyEditing) {
      this.jobService.updateSkill(currentlyEditing.id, skillName).subscribe({
        next: () => this.cancelEdit()
      });
    } else {
      this.jobService.addSkill(skillName, companyId).subscribe({
        next: () => {
          // When creating, `editingSkill` is already null, so `cancelEdit` wouldn't trigger the effect.
          // We must manually call the reset logic.
          this.resetFormToCreateState();
        }
      });
    }
  }

  editSkill(skill: Skill) {
    this.editingSkill.set(skill);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteSkill(skill: Skill) {
    this.skillToDelete.set(skill);
  }

  confirmDeleteSkill() {
    const skill = this.skillToDelete();
    if (skill) {
      this.jobService.deleteSkill(skill.id).subscribe({
        next: () => this.skillToDelete.set(null),
        error: () => this.skillToDelete.set(null), // Also close modal on error
      });
    }
  }

  cancelEdit() {
    this.editingSkill.set(null);
  }

  getCompanyName(companyId: string): string {
    return this.jobService.companies().find(c => c.id === companyId)?.name || '';
  }
}
