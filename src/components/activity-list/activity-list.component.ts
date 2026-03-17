import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService } from '../../services/job.service';
import { AuthService } from '../../services/auth.service';
import { TimeSlot } from '../../models/timeslot.model';
import { TranslationService } from '../../services/translation.service';
import { User } from '../../models/user.model';
import { Registration } from '../../models/registration.model';
import { Job } from '../../models/job.model';
import { NotificationService } from '../../services/notification.service';

type SlotViewStatus = 'available' | 'booked' | 'pending' | 'full';

interface ActivityListItem {
  isGroup: boolean;
  job: Job;
  // A representative slot for the group, or the single slot itself
  representativeSlot: TimeSlot; 
  slots: TimeSlot[];
}

@Component({
  selector: 'app-activity-list',
  imports: [CommonModule],
  templateUrl: './activity-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityListComponent {
  jobService = inject(JobService);
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  notificationService = inject(NotificationService);
  t = this.translationService.t;

  slotSelected = output<TimeSlot>();
  register = output<{ slotId: string, selectedSkill?: string }>();
  cancel = output<Registration>();
  
  // Filters
  titleFilter = input<string>('');
  companyIdFilter = input<string>('all');
  locationFilter = input<string>('');
  statusFilter = input<string>('all');
  skillFilter = input<string>('all');

  currentUser = this.authService.currentUser;
  registrations = this.jobService.registrations;

  activities = computed<ActivityListItem[]>(() => {
    // 1. Filter slots (logic adapted from calendar.component)
    const user = this.currentUser();
    if (!user) return [];
    
    let allSlots = this.jobService.timeSlots();

    if (!user.isGlobalAdmin) {
      allSlots = allSlots.filter(slot => {
        const userRegistrationSlotIds = new Set(
          this.registrations().filter(r => r.user.id === user.id).map(r => r.slotId)
        );
        const roleForCompany = user.rolesByCompany?.[slot.job.companyId];
        if (roleForCompany === 'user') {
            const userStatusForCompany = user.statusByCompany?.[slot.job.companyId] ?? 'active';
            if (userStatusForCompany === 'inactive') return userRegistrationSlotIds.has(slot.id);
            return true;
        }
        return false;
      });
    }

    const title = this.titleFilter().toLowerCase();
    const companyId = this.companyIdFilter();
    const location = this.locationFilter().toLowerCase();
    const status = this.statusFilter();
    const skill = this.skillFilter();
    const now = new Date().getTime();

    const filtered = allSlots.filter(slot => {
      const titleMatch = title ? this.getSlotDisplayTitle(slot).toLowerCase().includes(title) : true;
      const companyIdMatch = companyId !== 'all' ? slot.job.companyId === companyId : true;
      const locationMatch = location ? slot.job.location.toLowerCase().includes(location) : true;
      const skillMatch = skill !== 'all' ? (slot.requiredSkills ?? []).includes(skill) : true;
      const statusMatch = status !== 'all' ? this.getSlotViewStatus(slot).status === status : true;

      const passesStandardFilters = titleMatch && companyIdMatch && locationMatch && statusMatch && skillMatch;
      if (!passesStandardFilters) return false;

      const slotEndTime = slot.endTime.getTime();
      if (slotEndTime < now) {
          const userRegistration = this.registrations().find(r => r.slotId === slot.id && r.user.id === user.id);
          return !!userRegistration && userRegistration.status === 'approved';
      }
      return true;
    });

    // 2. Group slots
    const grouped = new Map<string, TimeSlot[]>();
    const singles: TimeSlot[] = [];
    for (const slot of filtered) {
        if (slot.job.isGrouped) {
            if (!grouped.has(slot.job.id)) grouped.set(slot.job.id, []);
            grouped.get(slot.job.id)!.push(slot);
        } else {
            singles.push(slot);
        }
    }

    // 3. Map to list items
    const singleItems: ActivityListItem[] = singles.map(slot => ({
      isGroup: false,
      job: slot.job,
      representativeSlot: slot,
      slots: [slot],
    }));

    const groupedItems: ActivityListItem[] = Array.from(grouped.values()).map(groupSlots => {
        groupSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        const representativeSlot = groupSlots[0];
        return {
            isGroup: true,
            job: representativeSlot.job,
            representativeSlot: representativeSlot,
            slots: groupSlots,
        };
    });

    // 4. Combine and sort
    return [...singleItems, ...groupedItems].sort((a, b) => 
        a.representativeSlot.startTime.getTime() - b.representativeSlot.startTime.getTime()
    );
  });

  selectItem(item: ActivityListItem) {
    this.slotSelected.emit(item.representativeSlot);
  }

  onRegister(item: ActivityListItem, event: Event) {
    event.stopPropagation();
    const slot = item.representativeSlot;
    
    if (this.userLacksSkills(slot)) {
        this.notificationService.showError('notifications.noSkills', 5000, {skills: slot.requiredSkills?.join(', ') ?? ''});
        return;
    }

    if (slot.capacityMode === 'skill') {
        const eligibleSkills = this.userEligibleSkills(slot);
        if (eligibleSkills.length > 1) {
            // User needs to choose a skill, open the detailed modal
            this.slotSelected.emit(slot);
            return; 
        } else if (eligibleSkills.length === 1) {
            // Register with the single eligible skill
            this.register.emit({ slotId: slot.id, selectedSkill: eligibleSkills[0] });
            return;
        }
    }
    
    // Default case: capacityMode is 'activity', or user has 0 eligible skills (but has at least one matching required skill)
    this.register.emit({ slotId: slot.id });
  }

  onCancel(item: ActivityListItem, event: Event) {
      event.stopPropagation();
      const user = this.currentUser();
      if (!user) return;

      const registration = this.registrations().find(r => 
          r.user.id === user.id && 
          (item.isGroup ? r.job.id === item.job.id : r.slotId === item.representativeSlot.id)
      );

      if (registration) {
          this.cancel.emit(registration);
      }
  }

  onDetails(item: ActivityListItem, event: Event) {
      event.stopPropagation();
      this.selectItem(item);
  }

  // --- Helper functions (adapted from calendar & job-details components) ---
  
  isUserAdminFor(slot: TimeSlot): boolean {
    const user = this.currentUser();
    if (!user) {
      return false;
    }
    if (user.isGlobalAdmin) {
      return true;
    }
    return user.rolesByCompany?.[slot.job.companyId] === 'company-admin';
  }
  
  private getGroupedActivityCounts(slot: TimeSlot): { approvedCount: number, pendingCount: number } {
    const isGrouped = slot.job.isGrouped;
    const allRegistrations = this.registrations();
    
    const relevantRegistrations = isGrouped 
        ? allRegistrations.filter(r => r.job.id === slot.job.id)
        : allRegistrations.filter(r => r.slotId === slot.id);

    const approvedRegs = relevantRegistrations.filter(r => r.status === 'approved');
    const pendingRegs = relevantRegistrations.filter(r => r.status === 'pending');

    const approvedUserIds = new Set(approvedRegs.map(r => r.user.id));
    const pendingUserIds = new Set(pendingRegs.map(r => r.user.id));

    return { approvedCount: approvedUserIds.size, pendingCount: pendingUserIds.size };
  }

  private getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
    if (!slot.requiredSkills || !user.skillsByCompany || !slot.job.companyId) {
      return null;
    }
    
    const userSkills = user.skillsByCompany[slot.job.companyId] || [];
    
    for (const requiredSkill of slot.requiredSkills) {
      if (userSkills.includes(requiredSkill)) {
        return requiredSkill; // This is the first matching skill
      }
    }
    
    return null;
  }
  
  userEligibleSkills(slot: TimeSlot): string[] {
    const user = this.currentUser();
    if (!user || !slot.requiredSkills || slot.capacityMode !== 'skill') {
        return [];
    }
    const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
    return slot.requiredSkills.filter(reqSkill => userSkills.includes(reqSkill));
  }

  userLacksSkills(slot: TimeSlot): boolean {
    const currentUser = this.currentUser();
    if (!currentUser) return false;

    const required = slot.requiredSkills;
    if (!required || required.length === 0) return false;

    if (slot.capacityMode === 'skill') {
        return this.userEligibleSkills(slot).length === 0;
    }

    const companyId = slot.job.companyId;
    const userSkillsForCompany = currentUser.skillsByCompany?.[companyId] || [];
    
    const hasAtLeastOneSkill = required.some(reqSkill => userSkillsForCompany.includes(reqSkill));
    return !hasAtLeastOneSkill;
  }

  getSlotDisplayTitle(slot: TimeSlot): string {
    const user = this.currentUser();
    if (!user) return slot.job.title;
    
    // An end user is never an admin for any slot in this view.
    const isAdminForThisSlot = false; 

    if (!isAdminForThisSlot && slot.job.hideTitleFromUser) {
        return this.t()('calendar.hiddenActivityName');
    }
    return slot.job.title;
  }

  getApprovedSkill(item: ActivityListItem): string | null {
    const user = this.currentUser();
    if (!user) return null;
    
    const registration = this.registrations().find(r => 
        r.user.id === user.id &&
        r.status === 'approved' &&
        (item.isGroup ? r.job.id === item.job.id : r.slotId === item.representativeSlot.id)
    );

    if (registration) {
      // Strictly use the skill saved during approval.
      return registration.registeredWithSkill ?? null;
    }
    
    return null;
  }

  getSlotViewStatus(slot: TimeSlot): { status: SlotViewStatus, text: string } {
    const user = this.currentUser();
    const trans = this.t();
    if (!user) return { status: 'available', text: '' };
    
    const isGrouped = slot.job.isGrouped;
    const allRegistrations = this.registrations();
    
    const userRegistration = allRegistrations.find(r => r.user.id === user.id && (isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id));
    if (userRegistration) {
      switch (userRegistration.status) {
        case 'pending': return { status: 'pending', text: trans('jobDetailsModal.statusValues.pending')};
        case 'approved': return { status: 'booked', text: trans('jobDetailsModal.statusValues.approved') };
      }
    }

    const { approvedCount } = this.getGroupedActivityCounts(slot);
    const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;

    if (approvedCount >= totalCapacity) {
      return { status: 'full', text: trans('calendar.legend.user.bookedFull') };
    }
    
    if (slot.capacityMode === 'skill' && slot.capacityBySkill && slot.requiredSkills) {
      const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
      const userEligibleSkills = slot.requiredSkills.filter(reqSkill => userSkills.includes(reqSkill));
  
      if (userEligibleSkills.length === 0) {
          return { status: 'full', text: trans('calendar.legend.user.bookedFull') };
      }
    }

    return { status: 'available', text: trans('calendar.legend.user.available') };
  }

  isSlotFull(slot: TimeSlot): boolean {
    const { approvedCount } = this.getGroupedActivityCounts(slot);
    const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;

    if (approvedCount >= totalCapacity) {
      return true;
    }

    const user = this.currentUser();
    if (user && slot.capacityMode === 'skill' && slot.capacityBySkill && slot.requiredSkills) {
      const allApprovedRegs = this.registrations().filter(r => 
          r.status === 'approved' && (slot.job.isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
      );
      
      const uniqueApprovedRegs = Array.from(new Map<string, Registration>(allApprovedRegs.map(reg => [reg.user.id, reg])).values());
  
      const skillTallies: Record<string, number> = {};
      for (const reg of uniqueApprovedRegs) {
          const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
          if (skillUsed) {
              skillTallies[skillUsed] = (skillTallies[skillUsed] || 0) + 1;
          }
      }
  
      const userEligibleSkills = this.userEligibleSkills(slot);
  
      if (userEligibleSkills.length === 0) {
        return true; // "Full" for this user because they don't have eligible skills.
      }
      
      const hasCapacityInAnySkill = userEligibleSkills.some(skill => {
        const tally = skillTallies[skill] || 0;
        const capacity = slot.capacityBySkill![skill] || 0;
        return tally < capacity;
      });

      if (!hasCapacityInAnySkill) {
        return true; // "Full" for this user because their eligible skill slots are full.
      }
    }

    return false;
  }
}
