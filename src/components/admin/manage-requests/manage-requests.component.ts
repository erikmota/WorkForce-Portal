import { Component, ChangeDetectionStrategy, inject, signal, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService } from '../../../services/job.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { Registration } from '../../../models/registration.model';
import { TranslationService } from '../../../services/translation.service';
import { TimeSlot } from '../../../models/timeslot.model';
import { User } from '../../../models/user.model';
import { UserQuickViewModalComponent } from '../../user-quick-view-modal/user-quick-view-modal.component';
import { ConfirmationModalComponent } from '../../confirmation-modal/confirmation-modal.component';
import { GeminiService } from '../../../services/gemini.service';
import { AiSuggestionModalComponent } from '../ai-suggestion-modal/ai-suggestion-modal.component';

export interface GroupedRequestItem {
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

interface GroupedRequests {
  [key: string]: GroupedRequestItem;
}

@Component({
  selector: 'app-manage-requests',
  imports: [CommonModule, UserQuickViewModalComponent, ConfirmationModalComponent, AiSuggestionModalComponent],
  templateUrl: './manage-requests.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageRequestsComponent {
  public jobService = inject(JobService);
  public notificationService = inject(NotificationService);
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);
  public geminiService = inject(GeminiService);
  public t = this.translationService.t;
  
  public approve = output<{ registration: Registration, comment: string, selectedSkill?: string }>();
  public approveBatch = output<{ registration: Registration, comment: string, selectedSkill?: string }[]>();
  public activityClicked = output<TimeSlot>();

  public requestStatusView = signal<'pending' | 'approved' | 'not-selected'>('pending');
  public comments = signal<Record<string, string>>({});

  // User Quick View Modal state
  public isUserQuickViewOpen = signal(false);
  public selectedUserForQuickView = signal<User | null>(null);
  
  // AI Suggestion Modal state
  public isAiModalOpen = signal(false);
  public selectedGroupForAi = signal<GroupedRequestItem | null>(null);

  // Skill Selection Modal state
  public showSkillSelectionForApproval = signal(false);
  public approvalCandidate = signal<{ registration: Registration, matchingSkills: string[], comment: string } | null>(null);
  public skillForApproval = signal<string>('');

  public startDate = input<string>('');
  public endDate = input<string>('');
  public title = input<string>('');
  public companyId = input<string>('all');
  public isGrouped = input<'all' | 'yes' | 'no'>('all');
  public needsTransportation = input<'all' | 'yes' | 'no'>('all');
  public skill = input<string>('all');
  public userId = input<string>('all');
  
  public currentUser = this.authService.currentUser;

  public allRegistrationsInView = computed(() => {
    switch (this.requestStatusView()) {
      case 'pending': return this.jobService.pendingRegistrations();
      case 'approved': return this.jobService.approvedRegistrations();
      case 'not-selected': return this.jobService.notSelectedRegistrations();
      default: return [];
    }
  });

  public filteredRegistrations = computed(() => {
    const user = this.currentUser();
    let registrations = this.allRegistrationsInView();
    const allSlots = this.jobService.timeSlots();

    // Filter by role (for company admins)
    if (user && !user.isGlobalAdmin && Object.values(user.rolesByCompany ?? {}).includes('company-admin')) {
      const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
        id => user.rolesByCompany![id] === 'company-admin'
      );
      registrations = registrations.filter(reg => adminCompanyIds.includes(reg.job.companyId));
    }

    // Apply all other filters
    const start = this.startDate();
    const end = this.endDate();
    const startTime = start ? new Date(start + 'T00:00:00').getTime() : 0;
    const endTime = end ? new Date(end + 'T23:59:59').getTime() : Infinity;
    
    const titleFilter = this.title().toLowerCase();
    const companyIdFilter = this.companyId();
    const isGroupedFilter = this.isGrouped();
    const transportFilter = this.needsTransportation();
    const skillFilter = this.skill();
    const userIdFilter = this.userId();

    return registrations.filter(reg => {
      const regTime = reg.startTime.getTime();
      const dateMatch = (!start && !end) ? true : (regTime >= startTime && regTime <= endTime);

      const titleMatch = titleFilter ? reg.job.title.toLowerCase().includes(titleFilter) : true;
      const companyMatch = companyIdFilter !== 'all' ? reg.job.companyId === companyIdFilter : true;
      const groupedMatch = isGroupedFilter === 'all' 
          ? true 
          : (isGroupedFilter === 'yes' ? !!reg.job.isGrouped : !reg.job.isGrouped);
      
      const transportMatch = transportFilter === 'all'
          ? true
          : (transportFilter === 'yes' ? !!reg.job.offersTransportation : !reg.job.offersTransportation);
      
      const slot = allSlots.find(s => s.id === reg.slotId);
      const skillMatch = skillFilter !== 'all' 
          ? (slot?.requiredSkills ?? []).includes(skillFilter) 
          : true;
      
      const userMatch = userIdFilter !== 'all' ? reg.user.id === userIdFilter : true;

      return dateMatch && titleMatch && companyMatch && groupedMatch && transportMatch && skillMatch && userMatch;
    });
  });

  public groupedRegistrations = computed(() => {
    const registrations = this.filteredRegistrations();
    const allSlots = this.jobService.timeSlots();
    const allRegistrations = this.jobService.registrations();
    
    const acc: GroupedRequests = {};

    for (const reg of registrations) {
      const isGrouped = !!reg.job.isGrouped;
      const key = isGrouped ? reg.job.id : reg.slotId;

      if (!acc[key]) {
        const relevantSlot = allSlots.find(s => s.id === reg.slotId);
        if (!relevantSlot) continue;

        let startTime = reg.startTime;
        let endTime: Date | undefined;

        if (isGrouped) {
          const allSlotsForJob = allSlots
            .filter(s => s.job.id === reg.job.id)
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
          
          if (allSlotsForJob.length > 0) {
            startTime = allSlotsForJob[0].startTime;
            endTime = allSlotsForJob[allSlotsForJob.length - 1].startTime;
          }
        }

        const regsForCapacity = allRegistrations.filter(r => (isGrouped ? r.job.id === key : r.slotId === key) && r.status === 'approved');
        const uniqueApprovedRegs = isGrouped 
          ? Array.from(new Map(regsForCapacity.map(r => [r.user.id, r])).values())
          : regsForCapacity;
        
        let capacityDetails: GroupedRequestItem['capacityDetails'];

        if (relevantSlot.capacityMode === 'skill' && relevantSlot.capacityBySkill) {
          const skillTallies: Record<string, number> = {};
          for (const approvedReg of uniqueApprovedRegs) {
            const skill = this.getRegisteredSkillForUser(approvedReg);
            if (skill) {
              skillTallies[skill] = (skillTallies[skill] || 0) + 1;
            }
          }
          capacityDetails = {
            mode: 'skill',
            totalApproved: uniqueApprovedRegs.length,
            // FIX: Cast the result of Object.values to number[] to ensure type safety for the reduce operation.
            totalCapacity: (Object.values(relevantSlot.capacityBySkill) as number[]).reduce((sum, cap) => sum + cap, 0),
            skills: (relevantSlot.requiredSkills || []).map(skillName => ({
              name: skillName,
              approved: skillTallies[skillName] || 0,
              capacity: relevantSlot.capacityBySkill?.[skillName] || 0,
            })),
          };
        } else {
          capacityDetails = {
            mode: 'activity',
            totalApproved: uniqueApprovedRegs.length,
            totalCapacity: relevantSlot.capacity,
          };
        }
        
        acc[key] = {
          jobTitle: reg.job.title,
          jobDescription: reg.job.description,
          jobLocation: reg.job.location,
          companyName: reg.job.companyName,
          startTime: startTime,
          endTime: endTime,
          isGroup: isGrouped,
          registrations: [],
          requiredSkills: relevantSlot.requiredSkills,
          capacityDetails,
          offersTransportation: reg.job.offersTransportation,
          transportationDepartureTime: reg.job.transportationDepartureTime,
          transportationDepartureLocation: reg.job.transportationDepartureLocation,
          transportationNotes: reg.job.transportationNotes,
        };
      }

      const userExists = acc[key].registrations.some(r => r.user.id === reg.user.id);
      if (!userExists) {
        acc[key].registrations.push(reg);
      }
    }
    
    Object.values(acc).forEach(group => {
      const requiredSkills = group.requiredSkills?.slice().sort() || [];

      const getPrimaryMatchingSkill = (user: User): string | null => {
        if (requiredSkills.length === 0 || !user.skillsByCompany || !group.registrations[0]?.job.companyId) {
            return null;
        }
        const companyId = group.registrations[0].job.companyId;
        const userSkills = user.skillsByCompany[companyId] || [];
        for (const reqSkill of requiredSkills) {
            if (userSkills.includes(reqSkill)) {
                return reqSkill;
            }
        }
        return null;
      };

      group.registrations.sort((a, b) => {
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

    return acc;
  });

  getGroupKeys() {
    return Object.keys(this.groupedRegistrations());
  }

  setView(status: 'pending' | 'approved' | 'not-selected') {
    this.requestStatusView.set(status);
  }

  updateComment(registrationId: string, text: string) {
    this.comments.update(c => ({...c, [registrationId]: text}));
  }

  getRegisteredSkillForUser(registration: Registration): string | null {
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

  handleApprove(registration: Registration) {
    const comment = this.comments()[registration.id] || 'comments.defaultApprove';
    this.continueApprovalFlow(registration, comment);
  }
  
  private continueApprovalFlow(registration: Registration, comment: string, selectedSkill?: string) {
    const slot = this.jobService.timeSlots().find(s => s.id === registration.slotId);

    const isSkillBasedWithMultipleOptions = !!(
      slot &&
      slot.capacityMode === 'skill' &&
      slot.requiredSkills &&
      slot.requiredSkills.length > 1
    );

    if (isSkillBasedWithMultipleOptions && !selectedSkill) {
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
        this.proceedWithApproval(registration, comment, skillToApprove);
      }
    } else {
      // This is a simple case: not skill-based, or only one required skill, or skill is already provided.
      this.proceedWithApproval(registration, comment, selectedSkill);
    }
  }

  private proceedWithApproval(registration: Registration, comment: string, selectedSkill?: string) {
    this.approve.emit({ registration, comment, selectedSkill });
    this.updateComment(registration.id, '');
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

  openUserQuickView(user: User) {
    this.selectedUserForQuickView.set(user);
    this.isUserQuickViewOpen.set(true);
  }

  closeUserQuickView() {
    this.isUserQuickViewOpen.set(false);
    this.selectedUserForQuickView.set(null);
  }

  getAiSuggestion(group: GroupedRequestItem) {
    this.selectedGroupForAi.set(group);
    this.isAiModalOpen.set(true);
  }

  closeAiModal() {
    this.isAiModalOpen.set(false);
    this.selectedGroupForAi.set(null);
  }

  applyAiSuggestion(suggestions: { approvals: { registrationId: string; selectedSkill?: string }[] }) {
    const t = this.translationService.t();
    const approvalComment = t('ai.approvalComment');

    const batch = suggestions.approvals.map(suggestion => {
      const registration = this.jobService.registrations().find(r => r.id === suggestion.registrationId);
      return { registration, comment: approvalComment, selectedSkill: suggestion.selectedSkill };
    }).filter(item => !!item.registration) as { registration: Registration, comment: string, selectedSkill?: string }[];

    if (batch.length > 0) {
      this.approveBatch.emit(batch);
    }

    this.closeAiModal();
  }

  onActivityClick(group: GroupedRequestItem) {
    // All registrations in a group share the same job.id
    // We can find the first slot associated with that job if it's a group,
    // or the specific slot if it's not.
    const representativeReg = group.registrations[0];
    if (!representativeReg) return;

    const slot = this.jobService.timeSlots().find(s => s.id === representativeReg.slotId);

    if (slot) {
      // For a grouped activity, the modal needs any of the slots from the group to work correctly.
      // The modal's internal logic will handle finding other related slots if `isGrouped` is true.
      this.activityClicked.emit(slot);
    } else {
      console.error('Could not find representative slot for activity:', group.jobTitle);
    }
  }
}
