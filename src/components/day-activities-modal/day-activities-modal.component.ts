import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TimeSlot } from '../../models/timeslot.model';
import { AuthService } from '../../services/auth.service';
import { JobService } from '../../services/job.service';
import { TranslationService } from '../../services/translation.service';
import { User } from '../../models/user.model';

interface DayData {
  date: Date;
  slots: TimeSlot[];
}

type SlotViewStatus = 'available' | 'booked' | 'pending' | 'full';

type ViewStatus = { 
  status: SlotViewStatus;
  text: string;
  pendingCount: number;
  capacityDetails?: {
    skill: string;
    approved: number;
    capacity: number;
  }[];
};

@Component({
  selector: 'app-day-activities-modal',
  imports: [CommonModule],
  templateUrl: './day-activities-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayActivitiesModalComponent {
  dayData = input.required<DayData | null>();
  close = output<void>();
  slotSelected = output<TimeSlot>();

  public jobService = inject(JobService);
  public authService = inject(AuthService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;

  public currentUser = this.authService.currentUser;
  public registrations = this.jobService.registrations;

  public jobColorMap = new Map<string, string>();
  // A palette of soft, accessible colors.
  public colorPalette = [
    '#fecaca', '#fed7aa', '#fde68a', '#d9f99d', '#bfdbfe', '#e9d5ff', '#fbcfe8',
    '#fca5a5', '#fdba74', '#fcd34d', '#bef264', '#93c5fd', '#d8b4fe', '#f9a8d4'
  ];

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

  private getJobColor(jobId: string): string {
    if (!this.jobColorMap.has(jobId)) {
      let hash = 0;
      for (let i = 0; i < jobId.length; i++) {
        hash = jobId.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
      }
      const index = Math.abs(hash % this.colorPalette.length);
      this.jobColorMap.set(jobId, this.colorPalette[index]);
    }
    return this.jobColorMap.get(jobId)!;
  }

  isColorDark(hexColor: string | null): boolean {
    if (!hexColor) return false;
    const color = (hexColor.charAt(0) === '#') ? hexColor.substring(1, 7) : hexColor;
    if (color.length < 6) return false;
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    // HSP equation from http://alienryderflex.com/hsp.html
    const hsp = Math.sqrt(
      0.299 * (r * r) +
      0.587 * (g * g) +
      0.114 * (b * b)
    );
    // Using the HSP value, determine whether the color is light or dark
    return hsp < 127.5;
  }
  
  getSlotBackgroundColor(slot: TimeSlot): string | null {
    const viewStatus = this.getSlotViewStatus(slot);
    if (viewStatus.status !== 'available') {
      return null;
    }
    if (!this.isUserAdminFor(slot)) {
        return null;
    }
    return slot.color || this.getJobColor(slot.job.id);
  }

  public isSlotInPast(slot: TimeSlot): boolean {
    return new Date(slot.endTime).getTime() < new Date().getTime();
  }

  getSlotClasses(slot: TimeSlot): string {
    const viewStatus = this.getSlotViewStatus(slot);
    let classes = '';

    switch (viewStatus.status) {
      case 'available':
        if (!this.isUserAdminFor(slot)) {
          classes = 'bg-blue-100 hover:bg-blue-200 border-blue-200 text-blue-800 cursor-pointer transition-colors';
        } else {
          const bgColor = slot.color || this.getJobColor(slot.job.id);
          const textClass = this.isColorDark(bgColor) ? 'text-white' : 'text-gray-900';
          classes = `${textClass} hover:opacity-80 border-transparent cursor-pointer transition-opacity`;
        }
        break;
      case 'booked':
        classes = 'bg-green-100 hover:bg-green-200 border-green-200 text-green-800 cursor-pointer transition-colors';
        break;
      case 'full':
        classes = 'bg-gray-200 hover:bg-gray-300 border-gray-300 text-gray-500 cursor-pointer transition-colors';
        break;
      case 'pending':
        classes = 'bg-yellow-100 hover:bg-yellow-200 border-yellow-200 text-yellow-800 cursor-pointer transition-colors';
        break;
      default:
        classes = 'bg-gray-100 border-gray-200';
        break;
    }

    if (this.isSlotInPast(slot)) {
      return classes + ' opacity-60';
    }
    return classes;
  }

  getSlotViewStatus(slot: TimeSlot): ViewStatus {
    const user = this.currentUser();
    const trans = this.t();
    if (!user) return { status: 'available', text: '', pendingCount: 0 };

    const slotRegistrations = this.registrations().filter(r => r.slotId === slot.id);
    const approvedRegistrations = slotRegistrations.filter(r => r.status === 'approved');
    const pendingCount = slotRegistrations.filter(r => r.status === 'pending').length;

    const isUserAdminForSlot = user.isGlobalAdmin || user.rolesByCompany?.[slot.job.companyId] === 'company-admin';

    // User-specific view (not admin)
    if (!isUserAdminForSlot) {
      const userRegistration = slotRegistrations.find(r => r.user.id === user.id);
      if (userRegistration) {
        switch (userRegistration.status) {
          case 'pending': return { status: 'pending', text: trans('jobDetailsModal.statusValues.pending'), pendingCount };
          case 'approved': return { status: 'booked', text: trans('jobDetailsModal.statusValues.approved'), pendingCount };
        }
      }
    }

    // Admin view for skill-based capacity
    if (isUserAdminForSlot && slot.capacityMode === 'skill' && slot.capacityBySkill) {
      const skillTallies: Record<string, number> = {};
      for (const reg of approvedRegistrations) {
        // Fallback for older data that might not have `registeredWithSkill`
        const skill = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
        if (skill) {
          skillTallies[skill] = (skillTallies[skill] || 0) + 1;
        }
      }

      const capacityDetails = (slot.requiredSkills || []).map(skillName => ({
        skill: skillName,
        approved: skillTallies[skillName] || 0,
        capacity: slot.capacityBySkill![skillName] || 0,
      }));

      const totalCapacity = Object.values(slot.capacityBySkill).reduce((s, c) => s + c, 0);
      const totalApproved = approvedRegistrations.length;
      const isFull = totalApproved >= totalCapacity;
      const availableSlots = totalCapacity - totalApproved;
      
      const text = isFull 
          ? trans('calendar.legend.admin.bookedFull') 
          : `${trans('calendar.legend.admin.available')} (${availableSlots}/${totalCapacity})`;

      return {
        status: isFull ? 'booked' : 'available',
        text: text,
        pendingCount,
        capacityDetails,
      };
    }

    // Default view (user and admin for non-skill capacity)
    const approvedCount = approvedRegistrations.length;
    if (approvedCount >= slot.capacity) {
      const text = trans('calendar.legend.admin.bookedFull');
      const status = isUserAdminForSlot ? 'booked' : 'full';
      return { status, text, pendingCount };
    }

    const availableSlots = slot.capacity - approvedCount;
    const availableText = isUserAdminForSlot
      ? `${trans('calendar.legend.admin.available')} (${availableSlots}/${slot.capacity})`
      : trans('calendar.legend.user.available');

    return { status: 'available', text: availableText, pendingCount };
  }

  getApprovedSkill(slot: TimeSlot): string | null {
    const user = this.currentUser();
    if (!user) return null;
    
    const registration = this.registrations().find(r => 
        r.user.id === user.id &&
        r.status === 'approved' &&
        (slot.job.isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
    );

    if (registration) {
      return registration.registeredWithSkill ?? null;
    }
    
    return null;
  }

  userEligibleSkills(slot: TimeSlot): string[] {
    const user = this.currentUser();
    if (!user || this.isUserAdminFor(slot) || !slot.requiredSkills || !slot.job.companyId) {
        return [];
    }
    const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
    return slot.requiredSkills.filter(reqSkill => userSkills.includes(reqSkill));
  }

  public getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
    if (!slot.requiredSkills || !user.skillsByCompany || !slot.job.companyId) {
      return null;
    }
    const userSkills = user.skillsByCompany[slot.job.companyId] || [];
    for (const requiredSkill of slot.requiredSkills) {
      if (userSkills.includes(requiredSkill)) {
        return requiredSkill;
      }
    }
    return null;
  }

  getSlotDisplayTitle(slot: TimeSlot): string {
    const user = this.currentUser();
    if (!user) return slot.job.title;

    const isAdminForThisSlot = this.isUserAdminFor(slot);
    
    if (!isAdminForThisSlot && slot.job.hideTitleFromUser) {
        return this.t()('calendar.hiddenActivityName');
    }
    return slot.job.title;
  }

  onClose() {
    this.close.emit();
  }

  onSlotClick(slot: TimeSlot) {
    this.slotSelected.emit(slot);
  }

  formatDate(date: Date | undefined): string {
    if (!date) return '';
    const lang = this.translationService.currentLanguage();
    return date.toLocaleDateString(lang, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
}
