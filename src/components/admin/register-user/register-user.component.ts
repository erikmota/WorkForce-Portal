import { Component, ChangeDetectionStrategy, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { NotificationService } from '../../../services/notification.service';
import { User } from '../../../models/user.model';
import { JobService } from '../../../services/job.service';
import { TranslationService } from '../../../services/translation.service';
import { EmailService } from '../../../services/email.service';
import { debounceTime, startWith } from 'rxjs';
import { Company } from '../../../models/company.model';
import { Skill } from '../../../models/skill.model';

@Component({
  selector: 'app-register-user',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register-user.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterUserComponent {
  public authService = inject(AuthService);
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public translationService = inject(TranslationService);
  public emailService = inject(EmailService);
  public t = this.translationService.t;

  public currentUser = this.authService.currentUser;
  public editingUser = signal<User | null>(null);

  // State for skills being edited: { [companyId]: { [skillName]: isSelected } }
  public selectedSkills = signal<Record<string, Record<string, boolean>>>({});
  // State for statuses being edited: { [companyId]: status }
  public companyStatuses = signal<Record<string, 'active' | 'inactive'>>({});
  // State for roles being edited: { [companyId]: role }
  public companyRoles = signal<Record<string, 'user' | 'company-admin'>>({});

  // Filter state
  public isFilterPanelVisible = signal(false);
  public filterForm = new FormGroup({
    name: new FormControl(''),
    username: new FormControl(''),
    status: new FormControl('all'),
    companyId: new FormControl('all'),
    skill: new FormControl('all'),
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

  public allAvailableSkills = computed(() => {
    const companyIds = new Set(this.availableCompanies().map(c => c.id));
    return this.jobService.skills().filter(s => companyIds.has(s.companyId));
  });

  public areFiltersActive = computed(() => {
    const filters = this.filterValues();
    return (
        (filters.name ?? '').trim() !== '' ||
        (filters.username ?? '').trim() !== '' ||
        filters.status !== 'all' ||
        filters.companyId !== 'all' ||
        filters.skill !== 'all'
    );
  });

  public usersFilteredByRole = computed(() => {
    const user = this.currentUser();
    const allUsers = this.authService.users();

    if (user && !user.isGlobalAdmin) {
      const adminCompanyIds = new Set(Object.keys(user.rolesByCompany ?? {}).filter(
        id => user.rolesByCompany![id] === 'company-admin'
      ));
      return allUsers.filter(u => {
        if (u.id === user.id) return true; // Show self
        const userCompanyIds = u.companyIds ?? [];
        if (userCompanyIds.length === 0 && !u.isGlobalAdmin) return false;
        // Show users who are part of at least one company that the current admin manages
        return userCompanyIds.some(id => adminCompanyIds.has(id));
      });
    }
    
    return allUsers; // Super admin sees all
  });
  
  public visibleUsers = computed(() => {
    const users = this.usersFilteredByRole();
    const filters = this.filterValues();

    const nameFilter = (filters.name ?? '').toLowerCase().trim();
    const usernameFilter = (filters.username ?? '').toLowerCase().trim();
    const statusFilter = filters.status;
    const companyFilter = filters.companyId;
    const skillFilter = filters.skill;
    
    if (!nameFilter && !usernameFilter && statusFilter === 'all' && companyFilter === 'all' && skillFilter === 'all') {
        return users;
    }

    return users.filter(user => {
        const nameMatch = nameFilter ? user.name.toLowerCase().includes(nameFilter) : true;
        const usernameMatch = usernameFilter ? user.username.toLowerCase().includes(usernameFilter) : true;
        
        let statusMatch = true;
        if (statusFilter !== 'all') {
          if (statusFilter === 'invited') {
            statusMatch = !!user.needsOnboarding;
          } else {
            statusMatch = (statusFilter === 'active' ? this.isUserGenerallyActive(user) : !this.isUserGenerallyActive(user)) && !user.needsOnboarding;
          }
        }
          
        const companyMatch = companyFilter !== 'all' ? (user.companyIds ?? []).includes(companyFilter!) : true;
        const skillMatch = skillFilter !== 'all' ? Object.values(user.skillsByCompany ?? {}).flat().includes(skillFilter!) : true;
        
        return nameMatch && usernameMatch && statusMatch && companyMatch && skillMatch;
    });
  });

  public formTitle = computed(() => {
    const user = this.editingUser();
    return user 
      ? this.t()('registerUser.editTitle', { name: user.name }) 
      : this.t()('registerUser.inviteTitle');
  });
  
  public submitButtonText = computed(() => this.editingUser() ? this.t()('registerUser.buttons.update') : this.t()('registerUser.buttons.invite'));

  public userForm = new FormGroup({
    name: new FormControl(''),
    username: new FormControl('', [Validators.required, Validators.email]),
    phone: new FormControl(''),
    dailyRate: new FormControl<number | null>(null, [Validators.min(0)]),
    isGlobalAdmin: new FormControl(false),
    companyIds: new FormControl<string[]>([]),
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

  constructor() {
    this.userForm.addValidators(this.atLeastOneSkillValidator.bind(this));

    effect(() => {
      // Re-run validation when these signals change, as they are outside the form model
      this.companyRoles();
      this.selectedSkills();
      this.userForm.updateValueAndValidity({ emitEvent: false });
    });

    effect(() => {
      const user = this.editingUser();
      const nameControl = this.userForm.get('name');
      
      if (user) { // We are editing, so name is required
        nameControl?.setValidators(Validators.required);
      } else { // We are inviting, so name is not required
        nameControl?.clearValidators();
      }
      nameControl?.updateValueAndValidity({ emitEvent: false });
    });

    this.userForm.get('isGlobalAdmin')?.valueChanges.pipe(
      startWith(this.userForm.get('isGlobalAdmin')?.value)
    ).subscribe(isGlobalAdmin => {
      const companyIdsCtrl = this.userForm.get('companyIds');
      if (isGlobalAdmin) {
        companyIdsCtrl?.clearValidators();
        companyIdsCtrl?.setValue([]);
      } else {
        companyIdsCtrl?.setValidators(Validators.required);
      }
      companyIdsCtrl?.updateValueAndValidity();
    });

    this.userForm.get('companyIds')?.valueChanges.subscribe(selectedCompanyIds => {
      if (!selectedCompanyIds) return;
      
      this.selectedSkills.update(currentSkills => {
          const newSkillsState = { ...currentSkills };
          Object.keys(currentSkills).forEach(companyId => {
              if (!selectedCompanyIds.includes(companyId)) {
                  delete newSkillsState[companyId];
              }
          });
          return newSkillsState;
      });

      this.companyStatuses.update(currentStatuses => {
        const newStatuses: Record<string, 'active' | 'inactive'> = {};
        selectedCompanyIds.forEach(id => {
          newStatuses[id] = currentStatuses[id] || 'active';
        });
        return newStatuses;
      });

      this.companyRoles.update(currentRoles => {
        const newRoles: Record<string, 'user' | 'company-admin'> = {};
        selectedCompanyIds.forEach(id => {
          newRoles[id] = currentRoles[id] || 'user';
        });
        return newRoles;
      });
    });

    this.filterForm.valueChanges.pipe(
      debounceTime(300)
    ).subscribe(values => {
        this.filterValues.set(values);
    });
  }

  private atLeastOneSkillValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const formGroup = control as FormGroup;
    const isGlobalAdmin = formGroup.get('isGlobalAdmin')?.value;
    const isEditing = !!this.editingUser();

    // Validation only applies when inviting a new, non-admin user
    if (isEditing || isGlobalAdmin) {
      return null;
    }

    const companyIds: string[] = formGroup.get('companyIds')?.value || [];
    const companyRoles = this.companyRoles();
    const selectedSkills = this.selectedSkills();

    // Check if there's at least one company where the role is 'user'
    const needsSkillValidation = companyIds.some(id => companyRoles[id] === 'user');

    if (!needsSkillValidation) {
      return null; // No validation needed if not assigning any 'user' roles
    }
    
    // Check if at least one skill is selected for any of the 'user' role companies
    const hasAtLeastOneSkill = companyIds.some(companyId => {
      if (companyRoles[companyId] === 'user') {
        const skillsForCompany = selectedSkills[companyId];
        if (skillsForCompany) {
          return Object.values(skillsForCompany).some(isSelected => isSelected);
        }
      }
      return false;
    });

    return hasAtLeastOneSkill ? null : { skillRequired: true };
  }

  getCompanyById(companyId: string): Company | undefined {
    return this.availableCompanies().find(c => c.id === companyId);
  }

  getSkillsForCompany(companyId: string): Skill[] {
    return this.jobService.skills().filter(s => s.companyId === companyId);
  }

  resetFilters() {
    this.filterForm.reset({
      name: '',
      username: '',
      status: 'all',
      companyId: 'all',
      skill: 'all',
    });
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

  isCompanySelected(companyId: string): boolean {
    return this.userForm.get('companyIds')?.value?.includes(companyId) ?? false;
  }

  onCompanyChange(event: Event, companyId: string) {
    const input = event.target as HTMLInputElement;
    const currentIds = this.userForm.get('companyIds')?.value ?? [];

    if (input.checked) {
      this.userForm.get('companyIds')?.setValue([...currentIds, companyId]);
    } else {
      this.userForm.get('companyIds')?.setValue(currentIds.filter(id => id !== companyId));
    }
  }

  updateCompanyStatus(companyId: string, status: 'active' | 'inactive') {
    this.companyStatuses.update(statuses => ({
      ...statuses,
      [companyId]: status,
    }));
  }

  updateCompanyRole(companyId: string, role: 'user' | 'company-admin') {
    this.companyRoles.update(roles => ({
      ...roles,
      [companyId]: role,
    }));

    // When a role is changed to company-admin, clear their skills for that company.
    if (role === 'company-admin') {
      this.selectedSkills.update(currentSkills => {
        const newSkills = { ...currentSkills };
        delete newSkills[companyId];
        return newSkills;
      });
    }
  }

  onSkillChange(companyId: string, skillName: string, isChecked: boolean) {
    this.selectedSkills.update(current => {
        const updated = { ...current };
        if (!updated[companyId]) {
            updated[companyId] = {};
        }
        updated[companyId][skillName] = isChecked;
        return updated;
    });
  }
  
  isUserGenerallyActive(user: User): boolean {
    if (user.isGlobalAdmin) return true;
    if (!user.companyIds || user.companyIds.length === 0) return false;
    // Active if their status is 'active' in at least one of their assigned companies.
    return user.companyIds.some(id => user.statusByCompany?.[id] === 'active');
  }

  getCompanyDetails(user: User): { name: string, role: string, status: 'active' | 'inactive' | 'invited', skills: string[] }[] {
    if (user.needsOnboarding) {
      return [{ name: this.t()('registerUser.statusValues.invited'), role: '-', status: 'invited', skills: [] }];
    }
    const ids = user.companyIds;
    if (user.isGlobalAdmin || !ids || ids.length === 0) return [];
    
    const admin = this.currentUser();
    let displayIds = ids;

    if (admin && !admin.isGlobalAdmin) {
      const adminCompanyIds = new Set(admin.companyIds || []);
      displayIds = ids.filter(id => adminCompanyIds.has(id));
    }
    
    if (displayIds.length === 0) return [];

    return this.jobService.companies()
      .filter(c => displayIds.includes(c.id))
      .map(c => {
        const status = user.statusByCompany?.[c.id] || 'active';
        const role = user.rolesByCompany?.[c.id] === 'company-admin'
          ? this.t()('registerUser.roles.companyAdmin')
          : this.t()('registerUser.roles.user');
        const skills = user.skillsByCompany?.[c.id] || [];
        return { name: c.name, role, status, skills };
      });
  }

  getSkills(user: User): string {
    if (!user.skillsByCompany) return 'N/A';
    const allUserSkills = [...new Set(Object.values(user.skillsByCompany).flat())];
    if (allUserSkills.length === 0) return 'N/A';
    return allUserSkills.join(', ');
  }

  editUser(user: User) {
    this.editingUser.set(user);
    this.userForm.patchValue({
      name: user.name,
      username: user.username,
      phone: user.phone || '',
      dailyRate: user.dailyRate ?? null,
      isGlobalAdmin: !!user.isGlobalAdmin,
      companyIds: user.companyIds || [],
      address: user.address || {},
      bankDetails: user.bankDetails || {},
    });
    
    this.companyStatuses.set(user.statusByCompany || {});
    this.companyRoles.set(user.rolesByCompany || {});

    const skillsForForm: Record<string, Record<string, boolean>> = {};
    const allSkillsForAdmin = this.jobService.skills();
    
    for (const companyId of user.companyIds || []) {
        skillsForForm[companyId] = {};
        const companySkills = allSkillsForAdmin.filter(s => s.companyId === companyId).map(s => s.name);
        const userSkillsForCompany = user.skillsByCompany?.[companyId] || [];
        for (const skillName of companySkills) {
            skillsForForm[companyId][skillName] = userSkillsForCompany.includes(skillName);
        }
    }
    this.selectedSkills.set(skillsForForm);
  }

  cancelEdit() {
    this.editingUser.set(null);
    this.userForm.reset({ isGlobalAdmin: false, companyIds: [] });
    this.selectedSkills.set({});
    this.companyStatuses.set({});
    this.companyRoles.set({});
  }

  resendInvitation(user: User) {
    this.emailService.sendInvitationEmail(user, user.password).subscribe(() => {
        this.notificationService.show(this.t()('notifications.invitationSent', { email: user.username }));
    });
  }

  resetPassword(user: User) {
    this.authService.resetPasswordForInvitedUser(user.id).subscribe(newPassword => {
      if (newPassword) {
        this.notificationService.show('notifications.passwordResetSuccess', 15000, {
          name: user.name,
          password: newPassword
        });
      }
    });
  }

  onSubmit() {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    const formValue = this.userForm.getRawValue();
    const username = (formValue.username ?? '').trim().toLowerCase();
    const companyIds: string[] = formValue.companyIds ?? [];
    const currentlyEditing = this.editingUser();

    const isDuplicate = this.authService.users().some(user => {
      if (currentlyEditing && user.id === currentlyEditing.id) {
        return false;
      }
      return user.username.toLowerCase() === username.toLowerCase();
    });

    if (isDuplicate) {
      this.notificationService.showError('notifications.usernameTaken', 5000, { username: username });
      return;
    }
    
    if (currentlyEditing) {
      // UPDATE existing user
      const skillsState = this.selectedSkills();
      const newSkillsByCompany: Record<string, string[]> = {};
      for (const companyId of companyIds) {
        const companySkills = skillsState[companyId];
        if (companySkills) {
          newSkillsByCompany[companyId] = Object.keys(companySkills).filter((key: string) => companySkills[key]);
        }
      }
      
      const userToSave: User = {
        ...currentlyEditing,
        name: formValue.name!,
        username: username,
        phone: formValue.phone || '',
        dailyRate: formValue.dailyRate ?? undefined,
        isGlobalAdmin: formValue.isGlobalAdmin!,
        companyIds: formValue.isGlobalAdmin ? [] : companyIds,
        skillsByCompany: formValue.isGlobalAdmin ? {} : newSkillsByCompany,
        statusByCompany: formValue.isGlobalAdmin ? {} : this.companyStatuses(),
        rolesByCompany: formValue.isGlobalAdmin ? {} : this.companyRoles(),
        address: formValue.address as any,
        bankDetails: formValue.bankDetails as any,
      };

      this.authService.updateUser(userToSave).subscribe(() => {
        this.notificationService.show('notifications.userUpdated', 3000, { name: userToSave.name });
        this.cancelEdit();
      });
    } else {
      // INVITE new user
      const skillsState = this.selectedSkills();
      const newSkillsByCompany: Record<string, string[]> = {};
      for (const companyId of companyIds) {
          const companySkills = skillsState[companyId];
          if (companySkills) {
              newSkillsByCompany[companyId] = Object.keys(companySkills).filter((key: string) => companySkills[key]);
          }
      }

      this.authService.inviteUser({
        username: username,
        isGlobalAdmin: formValue.isGlobalAdmin!,
        companyIds: companyIds,
        rolesByCompany: this.companyRoles(),
        skillsByCompany: newSkillsByCompany,
      }).subscribe(() => {
        this.notificationService.show(this.t()('notifications.invitationSent', { email: username }));
        this.cancelEdit();
      });
    }
  }
}
