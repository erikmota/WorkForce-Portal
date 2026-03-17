import { Component, ChangeDetectionStrategy, input, output, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TimeSlot } from '../../models/timeslot.model';
import { User } from '../../models/user.model';
import { AuthService } from '../../services/auth.service';
import { JobService } from '../../services/job.service';
import { Registration } from '../../models/registration.model';
import { TranslationService } from '../../services/translation.service';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { UserQuickViewModalComponent } from '../user-quick-view-modal/user-quick-view-modal.component';
import { GeminiService } from '../../services/gemini.service';
import { AiSuggestionModalComponent } from '../admin/ai-suggestion-modal/ai-suggestion-modal.component';

// This interface is used to structure data for the AI suggestion modal.
interface GroupedRequestItem {
  jobTitle: string;
  jobDescription: string;
  jobLocation: string;
  companyName: string;
  startTime: Date;
  registrations: Registration[];
  isGroup: boolean;
  endTime?: Date;
  requiredSkills?: string[];
  capacityDetails?: {
    mode: 'activity' | 'skill';
    totalApproved: number;
    totalCapacity: number;
    skills?: {
      name: string;
      approved: number;
      capacity: number;
    }[];
  };
  offersTransportation?: boolean;
  transportationDepartureTime?: string;
  transportationDepartureLocation?: string;
  transportationNotes?: string;
}

@Component({
  selector: 'app-job-details-modal',
  imports: [CommonModule, FormsModule, ConfirmationModalComponent, UserQuickViewModalComponent, AiSuggestionModalComponent],
  templateUrl: './job-details-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JobDetailsModalComponent {
  public slot = input.required<TimeSlot | null>();
  public user = input.required<User | null>();
  
  public close = output<void>();
  public register = output<{ slotId: string; needsTransportation: boolean; transportationNotes: string; selectedSkill?: string }>();
  public cancel = output<Registration>();
  public edit = output<TimeSlot>();
  public delete = output<string>();
  public approve = output<{ registration: Registration, comment: string, selectedSkill?: string }>();
  public approveBatch = output<{ registration: Registration, comment: string, selectedSkill?: string }[]>();

  public jobService = inject(JobService);
  public translationService = inject(TranslationService);
  public geminiService = inject(GeminiService);
  public t = this.translationService.t;
  
  public comments = signal<Record<string, string>>({});
  public showDeleteConfirm = signal(false);
  public showCancelConfirm = signal(false);
  
  // View and registration state
  public viewMode = signal<'details' | 'selectSkill'>('details');
  public selectedSkill = signal<string | null>(null);
  public needsTransportation = signal(false);
  public transportationNotes = signal('');

  // User Quick View Modal state
  public isUserQuickViewOpen = signal(false);
  public selectedUserForQuickView = signal<User | null>(null);
  
  // AI Modal State
  public isAiModalOpen = signal(false);
  public selectedGroupForAi = signal<GroupedRequestItem | null>(null);

  // Skill Selection Modal state
  public showSkillSelectionForApproval = signal(false);
  public approvalCandidate = signal<{ registration: Registration, matchingSkills: string[], comment: string } | null>(null);
  public skillForApproval = signal<string>('');

  // All registrations for the currently viewed slot or job group
  public slotRegistrations = computed<Registration[]>(() => {
    const currentSlot = this.slot();
    if (!currentSlot) return [];

    if (currentSlot.job.isGrouped) {
      return this.jobService.registrations().filter(r => r.job.id === currentSlot.job.id);
    }
    return this.jobService.registrations().filter(r => r.slotId === currentSlot.id);
  });
  
  // A list of registrations with unique users, for display purposes in grouped activities
  public uniqueUserRegistrations = computed(() => {
    const regs = this.slotRegistrations();
    if (!this.slot()?.job.isGrouped) {
        return regs;
    }
    const unique = new Map<string, Registration>();
    for (const reg of regs) {
        if (!unique.has(reg.user.id)) {
            unique.set(reg.user.id, reg);
        }
    }
    return Array.from(unique.values());
  });

  // The current user's registration for this slot, if it exists
  public currentUserRegistration = computed<Registration | undefined>(() => {
    const currentUser = this.user();
    if (!currentUser) return undefined;
    return this.slotRegistrations().find(r => r.user.id === currentUser.id);
  });

  public approvedSkill = computed<string | null>(() => {
    const registration = this.currentUserRegistration();
    if (registration?.status === 'approved') {
      // This is the fix: strictly use the skill saved during approval, no fallback.
      return registration.registeredWithSkill ?? null;
    }
    return null;
  });

  private readonly sortedUniqueUserRegistrations = computed(() => {
    const slot = this.slot();
    if (!slot) return [];

    const regs = this.uniqueUserRegistrations();
    const requiredSkills = slot.requiredSkills?.slice().sort() || [];
    
    const getPrimaryMatchingSkill = (user: User): string | null => {
        if (requiredSkills.length === 0 || !user.skillsByCompany || !slot.job.companyId) {
            return null;
        }
        const companyId = slot.job.companyId;
        const userSkills = user.skillsByCompany[companyId] || [];
        for (const reqSkill of requiredSkills) {
            if (userSkills.includes(reqSkill)) {
                return reqSkill;
            }
        }
        return null;
    }

    return [...regs].sort((a, b) => {
        const aSkill = getPrimaryMatchingSkill(a.user);
        const bSkill = getPrimaryMatchingSkill(b.user);

        // Users with a matching skill come before users without.
        if (aSkill && !bSkill) return -1;
        if (!aSkill && bSkill) return 1;

        // If both have skills, sort by skill name.
        if (aSkill && bSkill && aSkill !== bSkill) {
            return aSkill.localeCompare(bSkill);
        }

        // Otherwise, sort by user name.
        return a.user.name.localeCompare(b.user.name);
    });
  });

  public approvedRegistrations = computed(() => this.sortedUniqueUserRegistrations().filter(r => r.status === 'approved'));
  public pendingRegistrations = computed(() => this.sortedUniqueUserRegistrations().filter(r => r.status === 'pending'));

  public totalVisibleRegistrations = computed(() => {
    return this.pendingRegistrations().length + this.approvedRegistrations().length;
  });

  public isViewerAdminForSlot = computed(() => {
    const user = this.user();
    const slot = this.slot();
    if (!user || !slot) return false;
    if (user.isGlobalAdmin) return true;
    return user.rolesByCompany?.[slot.job.companyId] === 'company-admin';
  });

  public displayTitle = computed(() => {
    const slot = this.slot();
    if (!slot) return '';

    if (!this.isViewerAdminForSlot() && slot.job.hideTitleFromUser) {
        return this.t()('calendar.hiddenActivityName');
    }
    return slot.job.title;
  });

  public getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
    if (!slot.requiredSkills || !slot.job.companyId) return null;
    const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
    for (const reqSkill of slot.requiredSkills) {
      if (userSkills.includes(reqSkill)) {
        return reqSkill;
      }
    }
    return null;
  }

  public getSkillTallies(): Record<string, number> {
      const slot = this.slot();
      if (!slot || slot.capacityMode !== 'skill') return {};
      
      const uniqueApprovedRegs = new Map<string, Registration>();
      for (const reg of this.slotRegistrations().filter(r => r.status === 'approved')) {
          if (!uniqueApprovedRegs.has(reg.user.id)) {
              uniqueApprovedRegs.set(reg.user.id, reg);
          }
      }
  
      const tallies: Record<string, number> = {};
      for (const reg of uniqueApprovedRegs.values()) {
        const skillUsed = reg.registeredWithSkill ?? this.getPrimarySkillForUser(reg.user, slot);
        if (skillUsed) {
          tallies[skillUsed] = (tallies[skillUsed] || 0) + 1;
        }
      }
      return tallies;
  }

  public userEligibleSkills = computed<string[]>(() => {
    const slot = this.slot();
    const user = this.user();
    if (!slot || !user || !slot.requiredSkills || slot.capacityMode !== 'skill') {
      return [];
    }
    const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
    return slot.requiredSkills.filter(reqSkill => userSkills.includes(reqSkill));
  });

  public availableEligibleSkills = computed(() => {
    const eligibleSkills = this.userEligibleSkills();
    const details = this.capacityDetails();
    if (details?.mode !== 'skill') {
      return [];
    }
    return eligibleSkills.filter(skill => {
      const skillDetail = details.details.find(d => d.skill === skill);
      return skillDetail ? skillDetail.approved < skillDetail.total : false;
    });
  });

  public capacityDetails = computed(() => {
    const slot = this.slot();
    if (!slot) return null;

    const approved = this.approvedRegistrations();
    const approvedCount = approved.length;

    if (slot.capacityMode === 'skill' && slot.capacityBySkill && slot.requiredSkills) {
      const tallies = this.getSkillTallies();
      // FIX: Explicitly type `sum` and `cap` to resolve `unknown` type error for operator '+'.
      const totalCapacity = Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0);

      const details = slot.requiredSkills.map(skill => ({
        skill,
        approved: tallies[skill] ?? 0,
        total: slot.capacityBySkill![skill] ?? 0,
      }));

      let isFull = false;
      if (approvedCount >= totalCapacity) {
        isFull = true;
      } else {
        const currentUser = this.user();
        if (currentUser && !this.isViewerAdminForSlot()) {
          const userSkills = this.userEligibleSkills();
          if (userSkills.length === 0) {
            isFull = true;
          } else {
            const hasAvailableSkill = userSkills.some(skill => {
              const skillTally = tallies[skill] || 0;
              const skillCapacity = slot.capacityBySkill![skill] || 0;
              return skillTally < skillCapacity;
            });
            isFull = !hasAvailableSkill;
          }
        }
      }
      
      return { mode: 'skill', isFull, approvedCount, totalCapacity, details };
    } 
    
    const totalCapacity = slot.capacity;
    return { 
      mode: 'activity', 
      isFull: approvedCount >= totalCapacity, 
      approvedCount, 
      totalCapacity, 
      details: [] 
    };
  });

  public isSlotFull = computed(() => this.capacityDetails()?.isFull ?? true);

  public isSlotInPast = computed<boolean>(() => {
    const currentSlot = this.slot();
    if (!currentSlot) return true; // Default to true if slot is null
    return new Date(currentSlot.startTime).getTime() < new Date().getTime();
  });

  public canDeleteSlot = computed<boolean>(() => {
    return this.approvedRegistrations().length === 0;
  });

  public hasConflictingApprovedSlot = computed<boolean>(() => {
    const currentSlot = this.slot();
    const currentUser = this.user();
    if (!currentSlot || !currentUser) return false;

    // For grouped activities, check conflicts for all associated slots
    const slotsToCheck = currentSlot.job.isGrouped
        ? this.jobService.timeSlots().filter(s => s.job.id === currentSlot.job.id)
        : [currentSlot];

    const userApprovedRegs = this.jobService.registrations().filter(reg =>
        reg.user.id === currentUser.id && reg.status === 'approved'
    );

    for (const slot of slotsToCheck) {
        const newStartTime = new Date(slot.startTime).getTime();
        const newEndTime = new Date(slot.endTime).getTime();
        
        const hasConflict = userApprovedRegs.some(reg =>
            newStartTime < new Date(reg.endTime).getTime() &&
            newEndTime > new Date(reg.startTime).getTime()
        );
        
        if (hasConflict) return true;
    }

    return false;
  });

  public userLacksSkills = computed<boolean>(() => {
    const currentSlot = this.slot();
    const currentUser = this.user();
    if (!currentSlot || !currentUser || this.isViewerAdminForSlot()) return false;

    const required = currentSlot.requiredSkills;
    if (!required || required.length === 0) return false;

    if (currentSlot.capacityMode === 'skill') {
      return this.userEligibleSkills().length === 0;
    }

    const companyId = currentSlot.job.companyId;
    const userSkillsForCompany = currentUser.skillsByCompany?.[companyId] || [];
    
    const hasAtLeastOneSkill = required.some(reqSkill => userSkillsForCompany.includes(reqSkill));
    return !hasAtLeastOneSkill;
  });

  public isCurrentUserInactive = computed<boolean>(() => {
    const user = this.user();
    const slot = this.slot();
    if (!this.isViewerAdminForSlot() && user && slot) {
      const companyId = slot.job.companyId;
      // User is considered inactive for this slot if their status for this specific company is 'inactive'.
      // If status is not set for a company, default to 'active'.
      return user.statusByCompany?.[companyId] === 'inactive';
    }
    return false;
  });

  public groupedActivitySlots = computed<TimeSlot[]>(() => {
    const currentSlot = this.slot();
    if (!currentSlot?.job.isGrouped) {
      return [];
    }
    return this.jobService.timeSlots()
      .filter(s => s.job.id === currentSlot.job.id)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  });

  public groupedActivityDateRange = computed<{ start: Date | null, end: Date | null }>(() => {
    const groupedSlots = this.groupedActivitySlots();
    if (groupedSlots.length === 0) {
      return { start: null, end: null };
    }
    const start = groupedSlots[0].startTime;
    const end = groupedSlots[groupedSlots.length - 1].startTime; // Use startTime of last slot for date range
    return { start, end };
  });

  getDisplayTitleForRegistration(reg: Registration | undefined): string {
    if (!reg) return '';
    if (!this.isViewerAdminForSlot() && reg.job.hideTitleFromUser) {
        return this.t()('calendar.hiddenActivityName');
    }
    return reg.job.title;
  }

  updateComment(registrationId: string, text: string) {
    this.comments.update(c => ({...c, [registrationId]: text}));
  }

  onClose() {
    this.viewMode.set('details');
    this.close.emit();
  }

  onRegister() {
    const currentSlot = this.slot();
    if (!currentSlot) return;

    const availableSkills = this.availableEligibleSkills();

    if (currentSlot.capacityMode !== 'skill' || availableSkills.length <= 1) {
      this.confirmRegistration(availableSkills.length === 1 ? availableSkills[0] : undefined);
    } else {
      this.viewMode.set('selectSkill');
      this.selectedSkill.set(availableSkills[0]); // Pre-select first one
    }
  }

  confirmRegistration(skill?: string) {
    const currentSlot = this.slot();
    if (!currentSlot) return;

    const skillToRegister = skill !== undefined ? skill : this.selectedSkill();

    this.register.emit({
      slotId: currentSlot.id,
      needsTransportation: currentSlot.job.offersTransportation ? this.needsTransportation() : false,
      transportationNotes: currentSlot.job.offersTransportation && this.needsTransportation() ? this.transportationNotes() : '',
      selectedSkill: skillToRegister ?? undefined
    });
    this.viewMode.set('details');
  }

  onCancel() {
    if (this.currentUserRegistration()) {
      this.showCancelConfirm.set(true);
    }
  }

  confirmCancel() {
    const userRegistration = this.currentUserRegistration();
    if (userRegistration) {
      this.cancel.emit(userRegistration);
    }
    this.showCancelConfirm.set(false);
  }

  onEdit() {
    const currentSlot = this.slot();
    if (currentSlot) {
      this.edit.emit(currentSlot);
    }
  }

  onDelete() {
    this.showDeleteConfirm.set(true);
  }

  confirmDelete() {
    const currentSlot = this.slot();
    if (currentSlot) {
      this.delete.emit(currentSlot.id);
    }
    this.showDeleteConfirm.set(false);
  }

  onApprove(registration: Registration) {
    const comment = this.comments()[registration.id] || 'comments.defaultApprove';
    const slot = this.slot();

    const isSkillBasedWithMultipleOptions = !!(
      slot &&
      slot.capacityMode === 'skill' &&
      slot.requiredSkills &&
      slot.requiredSkills.length > 1
    );

    if (isSkillBasedWithMultipleOptions) {
        const userSkills = registration.user.skillsByCompany?.[registration.job.companyId] || [];
        const matchingSkills = slot!.requiredSkills!.filter(reqSkill => userSkills.includes(reqSkill));

        if (matchingSkills.length > 1) {
            // More than one skill matches, so we must ask the admin to choose.
            this.skillForApproval.set(matchingSkills[0]);
            this.approvalCandidate.set({ registration, matchingSkills, comment });
            this.showSkillSelectionForApproval.set(true);
        } else {
            // The activity is skill-based, but the user only has one matching skill (or none).
            // We can proceed with that one skill.
            const skillToApprove = matchingSkills.length === 1 ? matchingSkills[0] : undefined;
            this.approve.emit({ registration, comment, selectedSkill: skillToApprove });
            this.updateComment(registration.id, '');
        }
    } else {
        // This is a simple case: not skill-based, or only one required skill. Approve directly.
        this.approve.emit({ registration, comment });
        this.updateComment(registration.id, '');
    }
  }

  confirmApprovalWithSkill() {
    const candidate = this.approvalCandidate();
    const selectedSkill = this.skillForApproval();
    if (candidate && selectedSkill) {
      this.approve.emit({ registration: candidate.registration, comment: candidate.comment, selectedSkill });
      this.updateComment(candidate.registration.id, '');
    }
    this.cancelApprovalWithSkill();
  }

  cancelApprovalWithSkill() {
    this.showSkillSelectionForApproval.set(false);
    this.approvalCandidate.set(null);
    this.skillForApproval.set('');
  }

  public getRegisteredSkillForUser(registration: Registration): string | null {
    const slot = this.slot();
    if (!slot || !slot.requiredSkills || slot.requiredSkills.length === 0) {
      return null;
    }

    if (registration.registeredWithSkill) {
      return registration.registeredWithSkill;
    }
    
    // Fallback logic for older registrations
    return this.getPrimarySkillForUser(registration.user, slot);
  }

  openUserQuickView(user: User) {
    this.selectedUserForQuickView.set(user);
    this.isUserQuickViewOpen.set(true);
  }

  closeUserQuickView() {
    this.isUserQuickViewOpen.set(false);
    this.selectedUserForQuickView.set(null);
  }

  getAiSuggestion() {
    const slot = this.slot();
    if (!slot) return;

    const capacityDetails = this.capacityDetails();
    if (!capacityDetails) return;
    
    // The capacityDetails in this component has a different structure for 'details'
    const mappedSkills = capacityDetails.mode === 'skill' 
      ? capacityDetails.details.map(d => ({
          name: d.skill,
          approved: d.approved,
          capacity: d.total,
        }))
      : [];

    const group: GroupedRequestItem = {
      jobTitle: slot.job.title,
      jobDescription: slot.job.description,
      jobLocation: slot.job.location,
      companyName: slot.job.companyName,
      startTime: slot.startTime,
      registrations: this.pendingRegistrations(), // Pass only pending registrations to AI
      isGroup: slot.job.isGrouped ?? false,
      endTime: this.groupedActivityDateRange().end ?? slot.endTime,
      requiredSkills: slot.requiredSkills,
      capacityDetails: {
        // FIX: Explicitly cast `capacityDetails.mode` as TypeScript was incorrectly widening its type to `string`.
        mode: capacityDetails.mode as 'activity' | 'skill',
        totalApproved: capacityDetails.approvedCount,
        totalCapacity: capacityDetails.totalCapacity,
        skills: mappedSkills,
      },
      offersTransportation: slot.job.offersTransportation,
      transportationDepartureTime: slot.job.transportationDepartureTime,
      transportationDepartureLocation: slot.job.transportationDepartureLocation,
      transportationNotes: slot.job.transportationNotes,
    };

    this.selectedGroupForAi.set(group);
    this.isAiModalOpen.set(true);
  }

  closeAiModal() {
    this.isAiModalOpen.set(false);
    this.selectedGroupForAi.set(null);
  }

  applyAiSuggestion(suggestions: { approvals: { registrationId: string; selectedSkill?: string }[] }) {
    const approvalComment = 'comments.defaultApprove';

    const batch = suggestions.approvals.map(suggestion => {
      const registration = this.pendingRegistrations().find(r => r.id === suggestion.registrationId);
      return { registration, comment: approvalComment, selectedSkill: suggestion.selectedSkill };
    }).filter(item => !!item.registration) as { registration: Registration, comment: string, selectedSkill?: string }[];
    
    if (batch.length > 0) {
      this.approveBatch.emit(batch);
    }

    this.closeAiModal();
  }

  formatTime(date: Date | string): string {
    const lang = this.translationService.currentLanguage();
    return new Date(date).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(date: Date | string): string {
    const lang = this.translationService.currentLanguage();
    return new Date(date).toLocaleDateString(lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}
