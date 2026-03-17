import { Component, ChangeDetectionStrategy, computed, inject, input, output } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { User } from '../../models/user.model';
import { JobService } from '../../services/job.service';
import { TranslationService } from '../../services/translation.service';
import { TimeSlot } from '../../models/timeslot.model';

interface SkillStats {
  approved: number;
}

@Component({
  selector: 'app-user-quick-view-modal',
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './user-quick-view-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserQuickViewModalComponent {
  public user = input.required<User>();
  public close = output<void>();

  public jobService = inject(JobService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;

  public allUserRegistrations = computed(() => {
    const userId = this.user().id;
    return this.jobService.registrations().filter(r => r.user.id === userId);
  });

  public totalApproved = computed(() => {
    return this.allUserRegistrations().filter(r => r.status === 'approved').length;
  });

  public allUserSkills = computed(() => {
    const skillsByCompany = this.user().skillsByCompany ?? {};
    const allSkills = new Set<string>();
    for (const companyId in skillsByCompany) {
      skillsByCompany[companyId].forEach(skill => allSkills.add(skill));
    }
    return Array.from(allSkills).sort();
  });
  
  public statsBySkill = computed(() => {
    const stats: Record<string, SkillStats> = {};
    const userSkills = this.allUserSkills();
    
    // Initialize stats for all user skills
    userSkills.forEach(skill => {
      stats[skill] = { approved: 0 };
    });

    const registrations = this.allUserRegistrations();
    const allSlots = this.jobService.timeSlots();

    for (const reg of registrations) {
      if (reg.status !== 'approved') {
        continue;
      }

      let skillForReg: string | null = null;
      if (reg.registeredWithSkill) {
        skillForReg = reg.registeredWithSkill;
      } else {
        const slot = allSlots.find(s => s.id === reg.slotId);
        if (slot) {
           skillForReg = this.getPrimarySkillForUser(this.user(), slot);
        }
      }

      if (skillForReg && stats[skillForReg]) {
        if (reg.status === 'approved') {
          stats[skillForReg].approved++;
        }
      }
    }
    return stats;
  });
  
  public getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
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

  onClose() {
    this.close.emit();
  }
}
