import { Component, ChangeDetectionStrategy, inject, input, output, effect, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
// Fix: Swapped FormBuilder for FormGroup and FormControl to resolve a type error during form creation.
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors, Validators, ValidatorFn } from '@angular/forms';
import { JobService } from '../../../services/job.service';
import { NotificationService } from '../../../services/notification.service';
import { Job } from '../../../models/job.model';
import { TimeSlot } from '../../../models/timeslot.model';
import { AuthService } from '../../../services/auth.service';
import { TranslationService } from '../../../services/translation.service';
import { debounceTime, forkJoin, startWith } from 'rxjs';
import { ConfirmationModalComponent } from '../../confirmation-modal/confirmation-modal.component';
// FIX: Import uuidv4 to generate unique IDs for new activities.
import { v4 as uuidv4 } from 'uuid';
import { GeminiService } from '../../../services/gemini.service';
import { Registration } from '../../../models/registration.model';
import { Company } from '../../../models/company.model';

type ActivityListItem = TimeSlot | {
  isGroup: true;
  job: Job;
  slots: TimeSlot[];
  startDate: Date;
  endDate: Date;
  filledCapacity: number;
};

@Component({
  selector: 'app-register-activity',
  imports: [CommonModule, ReactiveFormsModule, ConfirmationModalComponent],
  templateUrl: './register-activity.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterActivityComponent {
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);
  public geminiService = inject(GeminiService);
  public t = this.translationService.t;

  public slotToEdit = input<TimeSlot | null>(null);
  public activitySaved = output<void>();
  
  public currentUser = this.authService.currentUser;
  
  public editingSlot = signal<TimeSlot | null>(null);
  public editingGroup = signal<Extract<ActivityListItem, { isGroup: true }> | null>(null);

  public activityToDelete = signal<ActivityListItem | null>(null);
  public cameFromOutside = false; // Flag to track if editing was initiated from parent component

  // AI State
  public isGeneratingDescription = signal(false);

  // Filter state
  public isFilterPanelVisible = signal(false);
  public filterForm = new FormGroup({
    title: new FormControl(''),
    companyId: new FormControl('all'),
    location: new FormControl(''),
    skill: new FormControl('all'),
    startDate: new FormControl(''),
    endDate: new FormControl(''),
  });
  public filterValues = signal(this.filterForm.value);
  public selectedCompanyId = signal<string | null>(null);

  // Reactive state for managing capacity controls
  public capacityMode = signal<'activity' | 'skill'>('activity');
  public requiredSkills = signal<string[]>([]);

  public hasApprovedRegistrations = computed(() => {
    const slot = this.editingSlot();
    if (slot) {
      return this.jobService.registrations().some(r => r.slotId === slot.id && r.status === 'approved');
    }
    const group = this.editingGroup();
    if (group) {
      return group.filledCapacity > 0;
    }
    return false;
  });

  public areFiltersActive = computed(() => {
    const filters = this.filterValues();
    return (
        (filters.title ?? '').trim() !== '' ||
        filters.companyId !== 'all' ||
        (filters.location ?? '').trim() !== '' ||
        filters.skill !== 'all' ||
        (filters.startDate ?? '') !== '' ||
        (filters.endDate ?? '') !== ''
    );
  });

  public approvedRegistrationsBySkill = computed(() => {
    const editingItem = this.editingSlot() ?? this.editingGroup();
    if (!editingItem) return {};

    const jobId = this.isGroup(editingItem) ? editingItem.job.id : editingItem.job.id;
    const firstSlot = this.isGroup(editingItem) ? editingItem.slots[0] : editingItem;

    if (firstSlot.capacityMode !== 'skill') return {};

    const approvedRegs = this.jobService.registrations().filter(r => 
        r.job.id === jobId && r.status === 'approved'
    );

    // For grouped activities, we need to count unique users.
    const uniqueApprovedRegs = this.isGroup(editingItem) 
        ? Array.from(new Map(approvedRegs.map(reg => [reg.user.id, reg])).values())
        : approvedRegs;
    
    const skillCounts: Record<string, number> = {};

    for (const reg of uniqueApprovedRegs) {
        const skillUsed = this.getRegisteredSkillForUser(reg);

        if (skillUsed) {
            skillCounts[skillUsed] = (skillCounts[skillUsed] || 0) + 1;
        }
    }

    return skillCounts;
  });

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

  public allSkillsForFilter = computed(() => {
    // Skills for the filter dropdown should be from companies available to the admin
    const companyIds = new Set(this.availableCompanies().map(c => c.id));
    return this.jobService.skills().filter(s => companyIds.has(s.companyId));
  });

  public visibleActivities = computed(() => {
    const slots = this.jobService.timeSlots();
    const filters = this.filterValues();

    const titleFilter = (filters.title ?? '').toLowerCase().trim();
    const companyFilter = filters.companyId;
    const locationFilter = (filters.location ?? '').toLowerCase().trim();
    const skillFilter = filters.skill;
    const startDateFilter = filters.startDate;
    const endDateFilter = filters.endDate;

    const startTime = startDateFilter ? new Date(startDateFilter + 'T00:00:00').getTime() : 0;
    const endTime = endDateFilter ? new Date(endDateFilter + 'T23:59:59').getTime() : Infinity;

    const user = this.currentUser();
    let roleFilteredSlots = slots;
    if (user && !user.isGlobalAdmin) {
        const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
          id => user.rolesByCompany![id] === 'company-admin'
        );
        roleFilteredSlots = slots.filter(slot => adminCompanyIds.includes(slot.job.companyId));
    }

    return roleFilteredSlots.filter(slot => {
      const titleMatch = titleFilter ? slot.job.title.toLowerCase().includes(titleFilter) : true;
      const companyMatch = companyFilter !== 'all' ? slot.job.companyId === companyFilter : true;
      const locationMatch = locationFilter ? slot.job.location.toLowerCase().includes(locationFilter) : true;
      const skillMatch = skillFilter !== 'all' ? (slot.requiredSkills ?? []).includes(skillFilter!) : true;
      
      let dateMatch = true;
      if (startTime > 0 || endTime < Infinity) {
          const slotTime = slot.startTime.getTime();
          dateMatch = slotTime >= startTime && slotTime <= endTime;
      }
      
      return titleMatch && companyMatch && locationMatch && skillMatch && dateMatch;
    }).sort((a,b) => b.startTime.getTime() - a.startTime.getTime());
  });
  
  public listItems = computed<ActivityListItem[]>(() => {
    const slots = this.visibleActivities();
    const grouped = new Map<string, TimeSlot[]>();
    const singles: TimeSlot[] = [];

    for (const slot of slots) {
        if (slot.job.isGrouped) {
            if (!grouped.has(slot.job.id)) {
                grouped.set(slot.job.id, []);
            }
            grouped.get(slot.job.id)!.push(slot);
        } else {
            singles.push(slot);
        }
    }

    const groupedItems: ActivityListItem[] = Array.from(grouped.values()).map(groupSlots => {
        groupSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        const firstSlot = groupSlots[0];
        const lastSlot = groupSlots[groupSlots.length - 1];
        
        const approvedUserIds = new Set<string>();
        const allGroupRegs = this.jobService.registrations().filter(r => r.job.id === firstSlot.job.id && r.status === 'approved');
        for (const reg of allGroupRegs) {
            approvedUserIds.add(reg.user.id);
        }

        return {
            isGroup: true,
            job: firstSlot.job,
            slots: groupSlots,
            startDate: firstSlot.startTime,
            endDate: lastSlot.startTime,
            filledCapacity: approvedUserIds.size,
        };
    });

    const allItems = [...singles, ...groupedItems];
    
    allItems.sort((a, b) => {
        const dateA = this.isGroup(a) ? a.startDate : a.startTime;
        const dateB = this.isGroup(b) ? b.startDate : b.startTime;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
    
    return allItems;
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

  public formTitle = computed(() => (this.editingSlot() || this.editingGroup()) ? this.t()('registerActivity.editTitle') : this.t()('registerActivity.newTitle'));
  public submitButtonText = computed(() => (this.editingSlot() || this.editingGroup()) ? this.t()('registerActivity.buttons.update') : this.t()('registerActivity.buttons.create'));

  public availableSkillsForActivity = computed(() => {
    const companyId = this.selectedCompanyId();
    if (!companyId) {
        return [];
    }
    return this.jobService.skills().filter(s => s.companyId === companyId);
  });

  public activityForm = new FormGroup({
    title: new FormControl('', Validators.required),
    hideTitleFromUser: new FormControl(false),
    isGrouped: new FormControl(false),
    offersTransportation: new FormControl(false),
    transportationDepartureTime: new FormControl(''),
    transportationDepartureLocation: new FormControl(''),
    transportationNotes: new FormControl(''),
    companyId: new FormControl<string | null>(null, Validators.required),
    description: new FormControl('', Validators.required),
    location: new FormControl('', Validators.required),
    startDate: new FormControl('', Validators.required),
    endDate: new FormControl(''),
    allDay: new FormControl(false),
    startTime: new FormControl('', Validators.required),
    endTime: new FormControl('', Validators.required),
    capacityMode: new FormControl<'activity' | 'skill'>('activity', { nonNullable: true }),
    capacity: new FormControl(1, [Validators.required, Validators.min(1)]),
    color: new FormControl(''),
    requiredSkills: new FormControl<string[]>([], { nonNullable: true }),
    capacitiesBySkill: new FormGroup({}),
  }, { validators: [this.timeRangeValidator, this.dateRangeValidator, this.activityConflictValidator()] });

  constructor() {
    // Effect to handle the input from parent (e.g., calendar)
    effect(() => {
        const externalSlot = this.slotToEdit();
        if (externalSlot) {
            this.cameFromOutside = true;
            this.editActivity(externalSlot);
        }
    });
    
    // Effect to patch form when editing state changes
    effect(() => {
      const slot = this.editingSlot();
      const group = this.editingGroup();
      
      if (group) { // EDITING A GROUPED ACTIVITY
        this.patchFormForEditingGroup(group);
      } else if (slot) { // EDITING A SINGLE SLOT
        this.patchFormForEditingSlot(slot);
      } else { // CREATING A NEW SLOT/GROUP
        this.resetFormToCreationState();
      }
    });

    // Effect to synchronously manage capacity form controls based on mode and selected skills
    effect(() => {
      const mode = this.capacityMode();
      const selectedSkills = this.requiredSkills();
      const capacityCtrl = this.activityForm.get('capacity');
      const capacitiesBySkillGroup = this.activityForm.get('capacitiesBySkill') as FormGroup;
      const counts = this.approvedRegistrationsBySkill();

      // 1. Manage validators and controls based on mode.
      if (mode === 'activity') {
        capacityCtrl?.setValidators([Validators.required, Validators.min(1)]);
        
        // When in activity mode, there should be NO controls for capacity by skill.
        if (Object.keys(capacitiesBySkillGroup.controls).length > 0) {
            Object.keys(capacitiesBySkillGroup.controls).forEach(skillName => {
                capacitiesBySkillGroup.removeControl(skillName);
            });
        }

      } else { // 'skill' mode
        capacityCtrl?.clearValidators();
        
        // Sync controls with selected skills
        Object.keys(capacitiesBySkillGroup.controls).forEach(skillName => {
          if (!selectedSkills.includes(skillName)) {
            capacitiesBySkillGroup.removeControl(skillName);
          }
        });

        selectedSkills.forEach(skillName => {
          const approvedCount = counts[skillName] || 0;
          const minCapacity = approvedCount > 0 ? approvedCount : 1;
          
          if (!capacitiesBySkillGroup.contains(skillName)) {
            const editing = this.editingGroup() || this.editingSlot();
            let initialCapacity = 1;
            if (editing) {
              if (this.isGroup(editing)) {
                initialCapacity = editing.slots[0]?.capacityBySkill?.[skillName] ?? 1;
              } else {
                initialCapacity = editing.capacityBySkill?.[skillName] ?? 1;
              }
            }
            capacitiesBySkillGroup.addControl(skillName, new FormControl(initialCapacity, [Validators.required, Validators.min(minCapacity)]));
          } else {
            const control = capacitiesBySkillGroup.get(skillName);
            if (control) {
                control.setValidators([Validators.required, Validators.min(minCapacity)]);
                control.updateValueAndValidity({ emitEvent: false });
            }
          }
        });
      }

      capacityCtrl?.updateValueAndValidity();

      // 2. Manage validators for the 'capacitiesBySkill' group itself
      if (mode === 'skill' && selectedSkills.length === 0) {
        capacitiesBySkillGroup?.setValidators(Validators.required);
      } else {
        capacitiesBySkillGroup?.clearValidators();
      }
      capacitiesBySkillGroup?.updateValueAndValidity();
    });

    // Subscriptions to update signals which trigger the effect
    this.activityForm.get('capacityMode')?.valueChanges.subscribe(mode => {
      if(mode) this.capacityMode.set(mode);
    });

    this.activityForm.get('requiredSkills')?.valueChanges.subscribe(skills => {
      if(skills) this.requiredSkills.set(skills);
    });

    this.activityForm.get('isGrouped')?.valueChanges.pipe(
      startWith(this.activityForm.get('isGrouped')?.value)
    ).subscribe(isGrouped => {
      const endDateCtrl = this.activityForm.get('endDate');
      if (isGrouped) {
        endDateCtrl?.setValidators(Validators.required);
        endDateCtrl?.enable();
      } else {
        endDateCtrl?.clearValidators();
        endDateCtrl?.setValue('');
        endDateCtrl?.disable();
      }
      endDateCtrl?.updateValueAndValidity();
    });

    this.activityForm.get('allDay')?.valueChanges.subscribe(allDay => {
      const startTimeCtrl = this.activityForm.get('startTime');
      const endTimeCtrl = this.activityForm.get('endTime');

      if (allDay) {
        startTimeCtrl?.clearValidators();
        endTimeCtrl?.clearValidators();
        startTimeCtrl?.setValue('00:00');
        endTimeCtrl?.setValue('23:59');
        startTimeCtrl?.disable();
        endTimeCtrl?.disable();
      } else {
        startTimeCtrl?.setValidators(Validators.required);
        endTimeCtrl?.setValidators(Validators.required);
        startTimeCtrl?.enable();
        endTimeCtrl?.enable();
        if(!this.editingSlot() && !this.editingGroup()) {
          startTimeCtrl?.setValue('');
          endTimeCtrl?.setValue('');
        }
      }
      startTimeCtrl?.updateValueAndValidity();
      endTimeCtrl?.updateValueAndValidity();
    });

    this.activityForm.get('offersTransportation')?.valueChanges.subscribe(offers => {
      this.toggleTransportationFields(offers!);
    });

    this.filterForm.valueChanges.pipe(
      debounceTime(300)
    ).subscribe(values => {
        this.filterValues.set(values);
    });

    this.activityForm.get('companyId')?.valueChanges.subscribe((companyId) => {
      this.selectedCompanyId.set(companyId);
      
      if (!this.editingSlot() && !this.editingGroup()) {
        this.activityForm.get('requiredSkills')?.setValue([]);
      }

      if (!this.editingSlot() && !this.editingGroup() && companyId) {
        const company = this.jobService.companies().find(c => c.id === companyId);
        if (company && company.defaultStartTime && company.defaultEndTime) {
          this.activityForm.patchValue({
            startTime: company.defaultStartTime,
            endTime: company.defaultEndTime,
          });
        }
      }
    });
  }

  private toggleTransportationFields(offers: boolean) {
    const timeCtrl = this.activityForm.get('transportationDepartureTime');
    const locationCtrl = this.activityForm.get('transportationDepartureLocation');
    const notesCtrl = this.activityForm.get('transportationNotes');
    const controls = [timeCtrl, locationCtrl, notesCtrl];

    if (offers && this.activityForm.get('offersTransportation')?.enabled) {
      timeCtrl?.setValidators(Validators.required);
      locationCtrl?.setValidators(Validators.required);
      controls.forEach(c => c?.enable({ emitEvent: false }));
    } else {
      timeCtrl?.clearValidators();
      locationCtrl?.clearValidators();
      controls.forEach(c => c?.disable({ emitEvent: false }));
    }
    timeCtrl?.updateValueAndValidity({ emitEvent: false });
    locationCtrl?.updateValueAndValidity({ emitEvent: false });
    notesCtrl?.updateValueAndValidity({ emitEvent: false });
  }

  private timeRangeValidator(control: AbstractControl): ValidationErrors | null {
    const group = control as FormGroup;
    const allDay = group.get('allDay')?.value;
    if (allDay) {
      return null; // Skip validation for all-day events
    }
    const startTime = group.get('startTime')?.value;
    const endTime = group.get('endTime')?.value;
    if (startTime && endTime && startTime >= endTime) {
      return { timeRange: true };
    }
    return null;
  }
  
  private dateRangeValidator(control: AbstractControl): ValidationErrors | null {
    const group = control as FormGroup;
    const startDate = group.get('startDate')?.value;
    const endDate = group.get('endDate')?.value;
    if (startDate && endDate && endDate < startDate) {
      return { dateRange: true };
    }
    return null;
  }

  private activityConflictValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const form = control as FormGroup;
      const { title, companyId, startDate, endDate, startTime, endTime, isGrouped, allDay } = form.getRawValue();
      
      const editingItem = this.editingSlot() ?? this.editingGroup();
      // When updating, we compare against other activities.
      // If the job ID is the same, it's the one we are editing, so we should ignore it.
      const editingJobId = editingItem ? (this.isGroup(editingItem) ? editingItem.job.id : editingItem.job.id) : null;
      
      if (!title || !companyId || !startDate || (isGrouped && !endDate) || (!allDay && (!startTime || !endTime))) {
        return null; // Not enough info to validate yet.
      }

      const allSlots = this.jobService.timeSlots();
      const trimmedTitle = title.trim().toLowerCase();

      const getDatesForDay = (dateStr: string): { start: Date, end: Date } => {
        const [year, month, day] = dateStr.split('-').map(Number);
        let finalStartTime: Date;
        let finalEndTime: Date;

        if (allDay) {
          finalStartTime = new Date(year, month - 1, day, 0, 0, 0);
          finalEndTime = new Date(year, month - 1, day, 23, 59, 59, 999);
        } else {
          const [startHour, startMinute] = startTime.split(':').map(Number);
          const [endHour, endMinute] = endTime.split(':').map(Number);
          finalStartTime = new Date(year, month - 1, day, startHour, startMinute);
          finalEndTime = new Date(year, month - 1, day, endHour, endMinute);
        }
        return { start: finalStartTime, end: finalEndTime };
      };

      const datesToCheck: { start: Date, end: Date }[] = [];
      if (isGrouped) {
        const loopStartDate = new Date(startDate + 'T00:00:00');
        const loopEndDate = new Date(endDate + 'T00:00:00');
        if (loopStartDate > loopEndDate) return null; // dateRangeValidator should catch this, but good to be safe

        let currentLoopDate = new Date(loopStartDate);
        while (currentLoopDate <= loopEndDate) {
          datesToCheck.push(getDatesForDay(this.formatDate(currentLoopDate)));
          currentLoopDate.setDate(currentLoopDate.getDate() + 1);
        }
      } else {
        if (startDate) {
          datesToCheck.push(getDatesForDay(startDate));
        }
      }

      for (const dateRange of datesToCheck) {
        const newStartMs = dateRange.start.getTime();
        const newEndMs = dateRange.end.getTime();

        const hasConflict = allSlots.some(slot => {
          if (slot.job.companyId !== companyId) return false;
          if (slot.job.title.toLowerCase() !== trimmedTitle) return false;
          // If we are editing, we must ignore the slots belonging to the activity being edited.
          if (editingJobId && slot.job.id === editingJobId) return false;

          const existingStartMs = slot.startTime.getTime();
          const existingEndMs = slot.endTime.getTime();

          // Overlap check: (startA < endB) and (endA > startB)
          return newStartMs < existingEndMs && newEndMs > existingStartMs;
        });

        if (hasConflict) {
          return { activityConflict: true };
        }
      }

      return null;
    };
  }

  isGroup(item: any): item is Extract<ActivityListItem, { isGroup: true }> {
    return item && item.isGroup === true;
  }

  private getRegisteredSkillForUser(registration: Registration): string | null {
    if (registration.registeredWithSkill) {
      return registration.registeredWithSkill;
    }
    
    const slot = this.jobService.timeSlots().find(s => s.id === registration.slotId);
    if (!slot?.requiredSkills || !slot.job.companyId) return null;

    const userSkills = registration.user.skillsByCompany?.[slot.job.companyId] || [];
    for (const reqSkill of slot.requiredSkills) {
      if (userSkills.includes(reqSkill)) {
        return reqSkill;
      }
    }
    return null;
  }

  private formatDate(date: Date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
  }

  private formatTime(date: Date) {
    const d = new Date(date);
    let hours = '' + d.getHours();
    let minutes = '' + d.getMinutes();
    if (hours.length < 2) hours = '0' + hours;
    if (minutes.length < 2) minutes = '0' + minutes;
    return [hours, minutes].join(':');
  }

  getFilledCapacity(slot: TimeSlot): number {
    return this.jobService.registrations().filter(r => r.slotId === slot.id && r.status === 'approved').length;
  }

  resetFilters() {
    this.filterForm.reset({
      title: '',
      companyId: 'all',
      location: '',
      skill: 'all',
      startDate: '',
      endDate: '',
    });
  }

  async generateDescription() {
    if (this.isGeneratingDescription()) return;
  
    const title = this.activityForm.get('title')?.value;
    if (!title) {
      this.notificationService.showError('notifications.ai.titleRequired');
      return;
    }
  
    this.isGeneratingDescription.set(true);
  
    const skills = this.activityForm.get('requiredSkills')?.value?.join(', ') || 'none';
    const companyName = this.availableCompanies().find(c => c.id === this.activityForm.get('companyId')?.value)?.name || '';
  
    const t = this.translationService.t();
    const prompt = t('ai.prompt.description', { title, skills: skills, company: companyName });
  
    try {
      const generatedDescription = await this.geminiService.generateText(prompt);
      if (generatedDescription) {
        this.activityForm.get('description')?.setValue(generatedDescription.trim());
        this.notificationService.show('notifications.ai.descriptionSuccess');
      }
    } finally {
      this.isGeneratingDescription.set(false);
    }
  }

  editActivity(item: ActivityListItem) {
    if (this.isGroup(item)) {
        this.editingGroup.set(item);
        this.editingSlot.set(null);
    } else { // item is a TimeSlot
        if (item.job.isGrouped) {
            // This slot is part of a group. We need to find all its sibling slots
            // and construct the group object to edit it correctly.
            const allSlotsForJob = this.jobService.timeSlots()
                .filter(s => s.job.id === item.job.id)
                .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
            
            if (allSlotsForJob.length > 0) {
                const firstSlot = allSlotsForJob[0];
                const lastSlot = allSlotsForJob[allSlotsForJob.length - 1];
                
                const approvedUserIds = new Set<string>();
                const allGroupRegs = this.jobService.registrations().filter(r => r.job.id === firstSlot.job.id && r.status === 'approved');
                for (const reg of allGroupRegs) {
                    approvedUserIds.add(reg.user.id);
                }

                const groupToEdit: Extract<ActivityListItem, { isGroup: true }> = {
                    isGroup: true,
                    job: firstSlot.job,
                    slots: allSlotsForJob,
                    startDate: firstSlot.startTime,
                    endDate: lastSlot.startTime,
                    filledCapacity: approvedUserIds.size,
                };

                this.editingGroup.set(groupToEdit);
                this.editingSlot.set(null);
            } else {
                // Fallback: This case is unlikely but handled for safety.
                this.editingSlot.set(item);
                this.editingGroup.set(null);
            }
        } else {
            // It's a regular single activity.
            this.editingSlot.set(item);
            this.editingGroup.set(null);
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  duplicateActivity(item: ActivityListItem) {
    this.editingSlot.set(null);
    this.editingGroup.set(null);
    // The effect will run and reset the form, which is fine.
    // Now we patch over it.

    let dataToPatch: any;
    let sourceSlot: TimeSlot; // A representative slot for time, capacity, etc.

    if (this.isGroup(item)) {
        sourceSlot = item.slots[0];
        dataToPatch = {
          title: item.job.title,
          hideTitleFromUser: item.job.hideTitleFromUser ?? false,
          isGrouped: item.job.isGrouped ?? false,
          offersTransportation: item.job.offersTransportation ?? false,
          transportationDepartureTime: item.job.transportationDepartureTime || '',
          transportationDepartureLocation: item.job.transportationDepartureLocation || '',
          transportationNotes: item.job.transportationNotes || '',
          companyId: item.job.companyId,
          description: item.job.description,
          location: item.job.location,
          // Dates are cleared
          startDate: '',
          endDate: '',
        };
    } else { // It's a TimeSlot
        sourceSlot = item;
        dataToPatch = {
          title: item.job.title,
          hideTitleFromUser: item.job.hideTitleFromUser ?? false,
          isGrouped: item.job.isGrouped ?? false,
          offersTransportation: item.job.offersTransportation ?? false,
          transportationDepartureTime: item.job.transportationDepartureTime || '',
          transportationDepartureLocation: item.job.transportationDepartureLocation || '',
          transportationNotes: item.job.transportationNotes || '',
          companyId: item.job.companyId,
          description: item.job.description,
          location: item.job.location,
          // Dates are cleared
          startDate: '',
          endDate: '',
        };
    }

    const isAllDay = sourceSlot.startTime.getHours() === 0 && sourceSlot.startTime.getMinutes() === 0 && sourceSlot.endTime.getHours() === 23 && sourceSlot.endTime.getMinutes() === 59;

    // Add common properties from the source slot
    const commonData = {
        startTime: isAllDay ? '00:00' : this.formatTime(sourceSlot.startTime),
        endTime: isAllDay ? '23:59' : this.formatTime(sourceSlot.endTime),
        capacity: sourceSlot.capacity,
        capacityMode: sourceSlot.capacityMode || 'activity',
        color: sourceSlot.color || '',
        requiredSkills: sourceSlot.requiredSkills || [],
        allDay: isAllDay,
    };

    this.activityForm.patchValue({ ...dataToPatch, ...commonData });
    
    // Manually set signals to trigger effects for dynamic parts of the form
    this.capacityMode.set(commonData.capacityMode);
    this.requiredSkills.set(commonData.requiredSkills);
    this.selectedCompanyId.set(dataToPatch.companyId);
    
    // Patch capacities by skill if needed
    if(commonData.capacityMode === 'skill' && sourceSlot.capacityBySkill) {
        const capacitiesBySkillGroup = this.activityForm.get('capacitiesBySkill') as FormGroup;
        // The effect will add the controls, we just need to set the values.
        Object.keys(sourceSlot.capacityBySkill).forEach(skillName => {
            if (capacitiesBySkillGroup.contains(skillName)) {
                capacitiesBySkillGroup.get(skillName)?.setValue(sourceSlot.capacityBySkill![skillName]);
            }
        });
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  deleteActivity(item: ActivityListItem) {
    this.activityToDelete.set(item);
  }

  confirmDeleteActivity() {
    const item = this.activityToDelete();
    if (!item) return;

    const observables$ = this.isGroup(item)
      ? item.slots.map(s => this.jobService.deleteSlot(s.id))
      : [this.jobService.deleteSlot(item.id)];

    forkJoin(observables$).subscribe(() => {
        const editingId = this.isGroup(item) ? this.editingGroup()?.job.id : this.editingSlot()?.id;
        const deletedId = this.isGroup(item) ? item.job.id : item.id;
        if (editingId === deletedId) {
            this.cancelEdit();
        }
        this.activityToDelete.set(null);
    });
  }

  isSkillLocked(skillName: string): boolean {
    const editingItem = this.editingSlot() ?? this.editingGroup();
    if (!editingItem) return false;

    const firstSlot = this.isGroup(editingItem) ? editingItem.slots[0] : editingItem;
    if (firstSlot.capacityMode !== 'skill') return false;

    const counts = this.approvedRegistrationsBySkill();
    return (counts[skillName] || 0) > 0;
  }

  isSkillSelected(skillName: string): boolean {
    return this.activityForm.get('requiredSkills')?.value?.includes(skillName) ?? false;
  }
  
  isOriginalSkill(skillName: string): boolean {
    const slot = this.editingSlot();
    const group = this.editingGroup();
    const skills = slot?.requiredSkills ?? group?.slots[0]?.requiredSkills ?? [];
    return skills.includes(skillName);
  }

  onSkillChange(event: Event, skillName: string) {
    const input = event.target as HTMLInputElement;
    const currentSkills = this.activityForm.get('requiredSkills')?.value ?? [];

    if (input.checked) {
      this.activityForm.get('requiredSkills')?.setValue([...currentSkills, skillName]);
    } else {
      this.activityForm.get('requiredSkills')?.setValue(currentSkills.filter(s => s !== skillName));
    }
  }

  cancelEdit() {
    const cameFromOutside = this.cameFromOutside;
    this.cameFromOutside = false;
    this.editingSlot.set(null);
    this.editingGroup.set(null);
    if (cameFromOutside) {
        this.activitySaved.emit();
    }
  }

  onSubmit() {
    if (this.activityForm.invalid) {
      this.activityForm.markAllAsTouched();
      return;
    }

    const formValue = this.activityForm.getRawValue();
    const company = this.availableCompanies().find(c => c.id === formValue.companyId!);

    if (!company) {
      this.notificationService.showError('notifications.invalidCompany', 5000);
      return;
    }

    const currentEditingSlot = this.editingSlot();
    const currentEditingGroup = this.editingGroup();

    if (currentEditingGroup) {
      this.handleUpdateGroupedActivity(currentEditingGroup, formValue, company);
    } else if (currentEditingSlot) {
      this.handleUpdateSingleSlot(currentEditingSlot, formValue, company);
    } else {
      this.handleCreateActivity(formValue, company);
    }
  }
  
  private handleUpdateGroupedActivity(group: Extract<ActivityListItem, { isGroup: true }>, formValue: any, company: Company) {
    const datesChanged = this.formatDate(group.startDate) !== formValue.startDate || this.formatDate(group.endDate) !== formValue.endDate;

    if (datesChanged && this.hasApprovedRegistrations()) {
      this.notificationService.showError("Cannot change dates of a grouped activity with registrations.");
      return;
    }

    const updatedJobData: Job = {
      ...group.job,
      title: formValue.title!,
      hideTitleFromUser: formValue.hideTitleFromUser ?? false,
      isGrouped: formValue.isGrouped ?? false,
      offersTransportation: formValue.offersTransportation ?? false,
      transportationDepartureTime: formValue.offersTransportation ? (formValue.transportationDepartureTime ?? undefined) : undefined,
      transportationDepartureLocation: formValue.offersTransportation ? (formValue.transportationDepartureLocation ?? undefined) : undefined,
      transportationNotes: formValue.offersTransportation ? (formValue.transportationNotes ?? undefined) : undefined,
      companyId: company.id,
      companyName: company.name,
      description: formValue.description!,
      location: formValue.location!,
    };
    
    if (datesChanged) {
      const deleteOps$ = group.slots.map(s => this.jobService.deleteSlot(s.id));
      forkJoin(deleteOps$).subscribe({
        next: () => {
          this.createSlotsForDateRange(updatedJobData, formValue);
          this.notificationService.show('notifications.activityUpdated');
          this.finishSubmit();
        },
        error: (err) => console.error("Failed to delete old group slots", err)
      });
    } else {
      const updateOps$ = group.slots.map(s => {
        const [startHour, startMinute] = formValue.startTime!.split(':').map(Number);
        const [endHour, endMinute] = formValue.endTime!.split(':').map(Number);
        const newStartTime = new Date(s.startTime);
        newStartTime.setHours(startHour, startMinute);
        const newEndTime = new Date(s.endTime);
        newEndTime.setHours(endHour, endMinute);

        const slotData = this.buildSlotData(updatedJobData, formValue);
        slotData.startTime = newStartTime;
        slotData.endTime = newEndTime;
        
        return this.jobService.updateSlot(s.id, slotData);
      });
      forkJoin(updateOps$).subscribe(() => {
        this.notificationService.show('notifications.activityUpdated');
        this.finishSubmit();
      });
    }
  }

  private handleUpdateSingleSlot(slot: TimeSlot, formValue: any, company: Company) {
    const jobData: Job = {
      ...slot.job,
      title: formValue.title!,
      hideTitleFromUser: formValue.hideTitleFromUser ?? false,
      isGrouped: formValue.isGrouped ?? false,
      offersTransportation: formValue.offersTransportation ?? false,
      transportationDepartureTime: formValue.offersTransportation ? (formValue.transportationDepartureTime ?? undefined) : undefined,
      transportationDepartureLocation: formValue.offersTransportation ? (formValue.transportationDepartureLocation ?? undefined) : undefined,
      transportationNotes: formValue.offersTransportation ? (formValue.transportationNotes ?? undefined) : undefined,
      companyId: company.id,
      companyName: company.name,
      description: formValue.description!,
      location: formValue.location!,
    };

    const slotData = this.buildSlotData(jobData, formValue);
    
    this.jobService.updateSlot(slot.id, slotData).subscribe(() => {
      this.notificationService.show('notifications.activityUpdated');
      this.finishSubmit();
    });
  }

  private handleCreateActivity(formValue: any, company: Company) {
    const jobData: Job = {
      id: `job-${uuidv4()}`,
      title: formValue.title!,
      hideTitleFromUser: formValue.hideTitleFromUser ?? false,
      isGrouped: formValue.isGrouped ?? false,
      offersTransportation: formValue.offersTransportation ?? false,
      transportationDepartureTime: formValue.offersTransportation ? (formValue.transportationDepartureTime ?? undefined) : undefined,
      transportationDepartureLocation: formValue.offersTransportation ? (formValue.transportationDepartureLocation ?? undefined) : undefined,
      transportationNotes: formValue.offersTransportation ? (formValue.transportationNotes ?? undefined) : undefined,
      companyId: company.id,
      companyName: company.name,
      description: formValue.description!,
      location: formValue.location!,
    };
    const createdCount = this.createSlotsForDateRange(jobData, formValue);
      
    if (createdCount > 1) {
        this.notificationService.show('notifications.activitiesAdded', 3000, {count: createdCount});
    } else if (createdCount === 1) {
        this.notificationService.show('notifications.activityAdded');
    }
    this.resetFormToCreationState();
  }

  private buildSlotData(jobData: Job, formValue: any): any {
    const {
      startDate, allDay, startTime, endTime, capacity, color, requiredSkills,
      capacityMode, capacitiesBySkill
    } = formValue;

    const [year, month, day] = startDate.split('-').map(Number);
    let finalStartTime: Date;
    let finalEndTime: Date;

    if (allDay) {
        finalStartTime = new Date(year, month - 1, day, 0, 0, 0);
        finalEndTime = new Date(year, month - 1, day, 23, 59, 59, 999);
    } else {
        const [startHour, startMinute] = startTime.split(':').map(Number);
        const [endHour, endMinute] = endTime.split(':').map(Number);
        finalStartTime = new Date(year, month - 1, day, startHour, startMinute);
        finalEndTime = new Date(year, month - 1, day, endHour, endMinute);
    }

    const slotData: any = {
      job: jobData,
      startTime: finalStartTime,
      endTime: finalEndTime,
      color: color || undefined,
      requiredSkills: (requiredSkills || []).length > 0 ? requiredSkills : undefined,
      capacityMode,
    };

    if (capacityMode === 'skill') {
      slotData.capacityBySkill = capacitiesBySkill;
      slotData.capacity = Object.values(capacitiesBySkill as Record<string, number>).reduce((sum, current) => sum + current, 0);
    } else {
      slotData.capacity = capacity;
    }

    return slotData;
  }

  private createSlotsForDateRange(jobData: Job, formValue: any): number {
      const startDateVal = formValue.startDate!;
      const endDateVal = formValue.endDate || startDateVal;
      const startDate = new Date(startDateVal + 'T00:00:00');
      const endDate = new Date(endDateVal + 'T00:00:00');
      let createdCount = 0;

      const loopDate = new Date(startDate);

      while (loopDate <= endDate) {
          const baseSlotData = this.buildSlotData(jobData, formValue);
          const newStartTime = new Date(baseSlotData.startTime);
          const newEndTime = new Date(baseSlotData.endTime);
          
          newStartTime.setFullYear(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
          newEndTime.setFullYear(loopDate.getFullYear(), loopDate.getMonth(), loopDate.getDate());
          
          const finalSlotData = { 
            ...baseSlotData,
            startTime: newStartTime, 
            endTime: newEndTime, 
          };
          this.jobService.addSlot(finalSlotData).subscribe();
          createdCount++;

          // Increment day for the next iteration
          loopDate.setDate(loopDate.getDate() + 1);
      }
      return createdCount;
  }

  private finishSubmit() {
    const cameFromOutside = this.cameFromOutside;
    this.cameFromOutside = false;
    this.editingSlot.set(null);
    this.editingGroup.set(null);

    if (cameFromOutside) {
      this.activitySaved.emit();
    }
  }

  private resetFormToCreationState() {
    const capacityControl = this.activityForm.get('capacity');
    
    this.activityForm.reset({ 
      capacity: 1, 
      companyId: null, 
      color: '', 
      requiredSkills: [], 
      allDay: false, 
      hideTitleFromUser: false, 
      isGrouped: false, 
      offersTransportation: false, 
      transportationDepartureTime: '',
      transportationDepartureLocation: '',
      transportationNotes: '',
      capacityMode: 'activity' 
    });
    capacityControl?.setValidators([Validators.required, Validators.min(1)]);
    
    const companies = this.availableCompanies();
    const user = this.currentUser();
    const isCompanyAdmin = user && !user.isGlobalAdmin && Object.values(user.rolesByCompany ?? {}).includes('company-admin');
    if (companies.length === 1 && isCompanyAdmin) {
      const company = companies[0];
      this.activityForm.get('companyId')?.setValue(company.id);
      this.selectedCompanyId.set(company.id);
      
      if (company.defaultStartTime && company.defaultEndTime) {
        this.activityForm.patchValue({
          startTime: company.defaultStartTime,
          endTime: company.defaultEndTime,
        });
      }
    }
    capacityControl?.updateValueAndValidity();
  }

  private patchFormForEditingGroup(group: Extract<ActivityListItem, { isGroup: true }>) {
    const { job, startDate, endDate, slots } = group;
    const firstSlot = slots[0];
    
    this.activityForm.patchValue({
      title: job.title,
      hideTitleFromUser: job.hideTitleFromUser ?? false,
      isGrouped: job.isGrouped ?? false,
      offersTransportation: job.offersTransportation ?? false,
      transportationDepartureTime: job.transportationDepartureTime || '',
      transportationDepartureLocation: job.transportationDepartureLocation || '',
      transportationNotes: job.transportationNotes || '',
      companyId: job.companyId,
      description: job.description,
      location: job.location,
      startDate: this.formatDate(startDate),
      endDate: this.formatDate(endDate),
      startTime: this.formatTime(firstSlot.startTime),
      endTime: this.formatTime(firstSlot.endTime),
      capacity: firstSlot.capacity,
      capacityMode: firstSlot.capacityMode || 'activity',
      color: firstSlot.color || '',
      requiredSkills: firstSlot.requiredSkills || [],
      allDay: false,
    }, { emitEvent: false });

    this.toggleTransportationFields(this.activityForm.getRawValue().offersTransportation!);
    
    // Manually set signals since patchValue doesn't emit events
    this.capacityMode.set(firstSlot.capacityMode || 'activity');
    this.requiredSkills.set(firstSlot.requiredSkills || []);
    
    this.selectedCompanyId.set(job.companyId);

    const hasApproved = this.hasApprovedRegistrations();
    const isSkillCapacityMode = firstSlot.capacityMode === 'skill';

    // Enable all controls by default before applying restrictions.
    this.activityForm.enable({ emitEvent: false });

    if (hasApproved) {
        this.activityForm.get('title')?.disable({ emitEvent: false });
        this.activityForm.get('hideTitleFromUser')?.disable({ emitEvent: false });
        this.activityForm.get('isGrouped')?.disable({ emitEvent: false });
        this.activityForm.get('offersTransportation')?.disable({ emitEvent: false });
        this.activityForm.get('companyId')?.disable({ emitEvent: false });
        this.activityForm.get('description')?.disable({ emitEvent: false });
        this.activityForm.get('location')?.disable({ emitEvent: false });
        this.activityForm.get('startDate')?.disable({ emitEvent: false });
        this.activityForm.get('endDate')?.disable({ emitEvent: false });
        this.activityForm.get('allDay')?.disable({ emitEvent: false });
        this.activityForm.get('startTime')?.disable({ emitEvent: false });
        this.activityForm.get('endTime')?.disable({ emitEvent: false });
        this.activityForm.get('color')?.disable({ emitEvent: false });
        this.activityForm.get('capacityMode')?.disable({ emitEvent: false });

        this.toggleTransportationFields(this.activityForm.getRawValue().offersTransportation!);

        if (isSkillCapacityMode) {
            this.activityForm.get('capacity')?.disable({ emitEvent: false });
            this.activityForm.get('requiredSkills')?.enable({ emitEvent: false });
        } else {
            this.activityForm.get('requiredSkills')?.disable({ emitEvent: false });
            this.activityForm.get('capacitiesBySkill')?.disable({ emitEvent: false });
        }
    }
    
    if (!this.activityForm.get('isGrouped')?.value) {
        this.activityForm.get('endDate')?.disable({ emitEvent: false });
    }
    if (this.activityForm.get('allDay')?.value) {
        this.activityForm.get('startTime')?.disable({ emitEvent: false });
        this.activityForm.get('endTime')?.disable({ emitEvent: false });
    }
    
    const capacityControl = this.activityForm.get('capacity');
    capacityControl?.setValidators([Validators.required, Validators.min(hasApproved ? group.filledCapacity : 1)]);
    this.activityForm.updateValueAndValidity({ emitEvent: false });
  }

  private patchFormForEditingSlot(slot: TimeSlot) {
    const isAllDay = slot.startTime.getHours() === 0 && slot.startTime.getMinutes() === 0 && slot.endTime.getHours() === 23 && slot.endTime.getMinutes() === 59;
    
    this.activityForm.patchValue({
      title: slot.job.title,
      hideTitleFromUser: slot.job.hideTitleFromUser ?? false,
      isGrouped: slot.job.isGrouped ?? false,
      offersTransportation: slot.job.offersTransportation ?? false,
      transportationDepartureTime: slot.job.transportationDepartureTime || '',
      transportationDepartureLocation: slot.job.transportationDepartureLocation || '',
      transportationNotes: slot.job.transportationNotes || '',
      companyId: slot.job.companyId,
      description: slot.job.description,
      location: slot.job.location,
      startDate: this.formatDate(slot.startTime),
      startTime: this.formatTime(slot.startTime),
      endTime: this.formatTime(slot.endTime),
      capacity: slot.capacity,
      capacityMode: slot.capacityMode || 'activity',
      color: slot.color || '',
      requiredSkills: slot.requiredSkills || [],
      allDay: isAllDay,
    }, { emitEvent: false });

    this.toggleTransportationFields(this.activityForm.getRawValue().offersTransportation!);

    // Manually set signals since patchValue doesn't emit events
    this.capacityMode.set(slot.capacityMode || 'activity');
    this.requiredSkills.set(slot.requiredSkills || []);

    this.selectedCompanyId.set(slot.job.companyId);

    const hasApproved = this.hasApprovedRegistrations();
    const isSkillCapacityMode = slot.capacityMode === 'skill';

    // Enable all controls by default before applying restrictions.
    this.activityForm.enable({ emitEvent: false });

    if (hasApproved) {
        this.activityForm.get('title')?.disable({ emitEvent: false });
        this.activityForm.get('hideTitleFromUser')?.disable({ emitEvent: false });
        this.activityForm.get('isGrouped')?.disable({ emitEvent: false });
        this.activityForm.get('offersTransportation')?.disable({ emitEvent: false });
        this.activityForm.get('companyId')?.disable({ emitEvent: false });
        this.activityForm.get('description')?.disable({ emitEvent: false });
        this.activityForm.get('location')?.disable({ emitEvent: false });
        this.activityForm.get('startDate')?.disable({ emitEvent: false });
        this.activityForm.get('endDate')?.disable({ emitEvent: false });
        this.activityForm.get('allDay')?.disable({ emitEvent: false });
        this.activityForm.get('startTime')?.disable({ emitEvent: false });
        this.activityForm.get('endTime')?.disable({ emitEvent: false });
        this.activityForm.get('color')?.disable({ emitEvent: false });
        this.activityForm.get('capacityMode')?.disable({ emitEvent: false });

        this.toggleTransportationFields(this.activityForm.getRawValue().offersTransportation!);

        if (isSkillCapacityMode) {
            this.activityForm.get('capacity')?.disable({ emitEvent: false });
            this.activityForm.get('requiredSkills')?.enable({ emitEvent: false });
        } else {
            this.activityForm.get('requiredSkills')?.disable({ emitEvent: false });
            this.activityForm.get('capacitiesBySkill')?.disable({ emitEvent: false });
        }
    }
    
    if (!this.activityForm.get('isGrouped')?.value) {
        this.activityForm.get('endDate')?.disable({ emitEvent: false });
    }
    if (this.activityForm.get('allDay')?.value) {
        this.activityForm.get('startTime')?.disable({ emitEvent: false });
        this.activityForm.get('endTime')?.disable({ emitEvent: false });
    }
    
    const capacityControl = this.activityForm.get('capacity');
    capacityControl?.setValidators([Validators.required, Validators.min(hasApproved ? this.getFilledCapacity(slot) : 1)]);
    this.activityForm.updateValueAndValidity({ emitEvent: false });
  }
}