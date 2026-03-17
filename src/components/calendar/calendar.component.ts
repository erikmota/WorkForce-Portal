import { Component, ChangeDetectionStrategy, computed, inject, input, output, signal, WritableSignal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService } from '../../services/job.service';
import { AuthService } from '../../services/auth.service';
import { TimeSlot } from '../../models/timeslot.model';
import { DayActivitiesModalComponent } from '../day-activities-modal/day-activities-modal.component';
import { TranslationService } from '../../services/translation.service';
import { User } from '../../models/user.model';
import { Registration } from '../../models/registration.model';

interface CalendarDay {
  date: Date;
  isToday: boolean;
  slots: TimeSlot[];
}

interface MonthDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  slots: TimeSlot[];
}

type SlotViewStatus = 'available' | 'booked' | 'pending' | 'full';

@Component({
  selector: 'app-calendar',
  imports: [CommonModule, DayActivitiesModalComponent],
  templateUrl: './calendar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit {
  jobService = inject(JobService);
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  t = this.translationService.t;

  slotSelected = output<TimeSlot>();
  
  currentUser = this.authService.currentUser;
  registrations = this.jobService.registrations;

  initialViewMode = input<'hourly' | 'daily' | 'monthly'>('daily');
  calendarViewMode: WritableSignal<'hourly' | 'daily' | 'monthly'>;
  currentDate = signal(new Date());

  isDayPopupOpen = signal(false);
  popupDayData = signal<{ date: Date, slots: TimeSlot[] } | null>(null);

  // Filters
  titleFilter = input<string>('');
  companyNameFilter = input<string>('');
  companyIdFilter = input<string>('all');
  isGroupedFilter = input<'all' | 'yes' | 'no'>('all');
  locationFilter = input<string>('');
  statusFilter = input<string>('all');
  startDateFilter = input<string>('');
  endDateFilter = input<string>('');
  needsTransportationFilter = input<'all' | 'yes' | 'no'>('all');
  skillFilter = input<string>('all');
  userIdFilter = input<string>('all');

  private jobColorMap = new Map<string, string>();
  // A palette of soft, accessible colors.
  private colorPalette = [
    '#fecaca', '#fed7aa', '#fde68a', '#d9f99d', '#bfdbfe', '#e9d5ff', '#fbcfe8',
    '#fca5a5', '#fdba74', '#fcd34d', '#bef264', '#93c5fd', '#d8b4fe', '#f9a8d4'
  ];

  constructor() {
    this.calendarViewMode = signal(this.initialViewMode());
  }

  ngOnInit(): void {
    this.calendarViewMode.set(this.initialViewMode());
  }

  calendarHeader = computed(() => {
    const date = this.currentDate();
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();

    if (this.calendarViewMode() === 'monthly') {
      return `${month} ${year}`;
    }

    // Check if the week spans across two months or years
    const firstDayOfWeek = new Date(date);
    firstDayOfWeek.setDate(date.getDate() - date.getDay() + 1);
    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);

    if (firstDayOfWeek.getMonth() !== lastDayOfWeek.getMonth()) {
      const firstMonth = firstDayOfWeek.toLocaleString('default', { month: 'short' });
      const lastMonth = lastDayOfWeek.toLocaleString('default', { month: 'short' });
      if (firstDayOfWeek.getFullYear() !== lastDayOfWeek.getFullYear()) {
        return `${firstMonth} ${firstDayOfWeek.getFullYear()} - ${lastMonth} ${lastDayOfWeek.getFullYear()}`;
      }
      return `${firstMonth} - ${lastMonth} ${year}`;
    }

    return `${month} ${year}`;
  });

  private filteredSlots = computed<TimeSlot[]>(() => {
    const user = this.currentUser();
    if (!user) return [];
    
    let allSlots = this.jobService.timeSlots();
    const isEndUser = !this.authService.isCurrentUserGlobalAdmin() && !this.authService.isCurrentUserCompanyAdmin();

    if (isEndUser) {
      const userRegistrationSlotIds = new Set(
        this.registrations()
          .filter(r => r.user.id === user.id)
          .map(r => r.slotId)
      );
      allSlots = allSlots.filter(slot => userRegistrationSlotIds.has(slot.id));
    }
    
    const userId = this.userIdFilter();

    // Admin user filter
    if (userId !== 'all' && userId) {
      const userRegistrationSlotIds = new Set(
          this.registrations()
              .filter(r => r.user.id === userId)
              .map(r => r.slotId)
      );
      allSlots = allSlots.filter(slot => userRegistrationSlotIds.has(slot.id));
    }

    // Base filtering based on user role and company associations/status
    if (!user.isGlobalAdmin) {
       allSlots = allSlots.filter(slot => {
        const userRegistrationSlotIds = new Set(
          this.registrations()
            .filter(r => r.user.id === user.id)
            .map(r => r.slotId)
        );
        
        const roleForCompany = user.rolesByCompany?.[slot.job.companyId];

        if (roleForCompany === 'company-admin') {
            return true;
        }

        if (roleForCompany === 'user') {
            const userStatusForCompany = user.statusByCompany?.[slot.job.companyId] ?? 'active';
            // If user is inactive for this company, only show if they are already registered.
            if (userStatusForCompany === 'inactive') {
                return userRegistrationSlotIds.has(slot.id);
            }
            return true;
        }

        return false; // No role for this company means no access.
      });
    }

    // Apply user-facing filters
    const title = this.titleFilter().toLowerCase();
    const companyName = this.companyNameFilter().toLowerCase();
    const companyId = this.companyIdFilter();
    const isGrouped = this.isGroupedFilter();
    const location = this.locationFilter().toLowerCase();
    const status = this.statusFilter();
    const startDate = this.startDateFilter();
    const endDate = this.endDateFilter();
    const transportFilter = this.needsTransportationFilter();
    const skillFilter = this.skillFilter();
    const startTime = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endTime = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
    
    const now = new Date().getTime();

    return allSlots.filter(slot => {
        const titleMatch = title ? slot.job.title.toLowerCase().includes(title) : true;
        const companyNameMatch = companyName ? slot.job.companyName.toLowerCase().includes(companyName) : true;
        const companyIdMatch = companyId !== 'all' ? slot.job.companyId === companyId : true;
        const locationMatch = location ? slot.job.location.toLowerCase().includes(location) : true;
        const groupedMatch = isGrouped === 'all' 
          ? true 
          : (isGrouped === 'yes' ? !!slot.job.isGrouped : !slot.job.isGrouped);
        
        let statusMatch = true;
        if (status && status !== 'all') {
          if (user.isGlobalAdmin || Object.values(user.rolesByCompany ?? {}).includes('company-admin')) {
            // Admin status filtering logic
            const { approvedCount, pendingCount } = this.getGroupedActivityCounts(slot);
            const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
              ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
              : slot.capacity;

            switch (status) {
              case 'available':
                statusMatch = approvedCount < totalCapacity && pendingCount === 0;
                break;
              case 'booked': // Corresponds to "Booked / Full" in the dropdown
                statusMatch = approvedCount >= totalCapacity;
                break;
              case 'pending': // Corresponds to "Has Pending Requests"
                statusMatch = pendingCount > 0;
                break;
              default:
                statusMatch = true;
            }
          } else { // This will be for the 'user' role
            // Existing user status filtering logic
            const viewStatus = this.getSlotViewStatus(slot).status;
            statusMatch = viewStatus === status;
          }
        }

        const transportMatch = transportFilter === 'all'
          ? true
          : (transportFilter === 'yes' ? !!slot.job.offersTransportation : !slot.job.offersTransportation);

        const skillMatch = skillFilter !== 'all'
            ? (slot.requiredSkills ?? []).includes(skillFilter)
            : true;

        let dateMatch = true;
        if (startTime > 0 || endTime < Infinity) {
          const slotTime = slot.startTime.getTime();
          dateMatch = slotTime >= startTime && slotTime <= endTime;
        }
        
        const passesStandardFilters = titleMatch && companyNameMatch && companyIdMatch && locationMatch && statusMatch && dateMatch && groupedMatch && transportMatch && skillMatch;
        if (!passesStandardFilters) {
            return false;
        }

        // Additional logic for user role regarding past activities
        if (!user.isGlobalAdmin && !Object.values(user.rolesByCompany ?? {}).includes('company-admin')) {
            const slotEndTime = slot.endTime.getTime();
            if (slotEndTime < now) { // Slot is in the past
                const userRegistration = this.registrations().find(r => r.slotId === slot.id && r.user.id === user.id);
                // Only show if user has a final registration status for it
                return !!userRegistration && userRegistration.status === 'approved';
            }
        }

        return true;
    });
  });

  hours = computed(() => {
    const allSlots = this.calendarDays().flatMap(day => day.slots);
    const uniqueHours = new Set<number>();
    allSlots.forEach(slot => {
      const startHour = slot.startTime.getHours();
      let endHour = slot.endTime.getHours();

      // If a slot ends at exactly XX:00, it doesn't occupy that hour slot.
      // e.g., 9:00 to 10:00 is only for hour 9.
      if (slot.endTime.getMinutes() === 0 && slot.endTime.getSeconds() === 0 && slot.endTime.getMilliseconds() === 0) {
        endHour--;
      }
      
      for (let h = startHour; h <= endHour; h++) {
        uniqueHours.add(h);
      }
    });
    return Array.from(uniqueHours).sort((a, b) => a - b);
  });

  calendarDays = computed<CalendarDay[]>(() => {
    const filteredSlots = this.filteredSlots();
    const today = new Date(); // Today's date for comparison
    const days: CalendarDay[] = [];
    
    const current = new Date(this.currentDate());
    // Correctly calculate the first day of the week (Monday)
    const dayOfWeek = current.getDay(); // 0 for Sunday, 1 for Monday
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const firstDayOfWeek = new Date(current);
    firstDayOfWeek.setDate(current.getDate() + offset);

    for (let i = 0; i < 7; i++) {
      const date = new Date(firstDayOfWeek);
      date.setDate(firstDayOfWeek.getDate() + i);
      
      const daySlots = filteredSlots.filter(
        slot => slot.startTime.getFullYear() === date.getFullYear() &&
                slot.startTime.getMonth() === date.getMonth() &&
                slot.startTime.getDate() === date.getDate()
      ).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      
      const isToday = date.getFullYear() === today.getFullYear() &&
                      date.getMonth() === today.getMonth() &&
                      date.getDate() === today.getDate();
      
      days.push({
        date,
        isToday,
        slots: daySlots,
      });
    }
    return days;
  });
  
  monthDaysGrid = computed<MonthDay[][]>(() => {
    if (this.calendarViewMode() !== 'monthly') {
        return [];
    }

    const filteredSlots = this.filteredSlots();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentDate = this.currentDate();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    
    // Day of week: Sunday = 0, Monday = 1, etc.
    // We want the week to start on Monday.
    const dayOfWeek = firstDayOfMonth.getDay();
    const startOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;

    const startDate = new Date(firstDayOfMonth);
    startDate.setDate(startDate.getDate() - startOffset);

    const weeks: MonthDay[][] = [];
    let currentLoopDate = new Date(startDate);

    for (let weekIndex = 0; weekIndex < 6; weekIndex++) { // Always render 6 weeks for a consistent grid height
        const week: MonthDay[] = [];
        for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
            
            const daySlots = filteredSlots.filter(
                slot => slot.startTime.getFullYear() === currentLoopDate.getFullYear() &&
                        slot.startTime.getMonth() === currentLoopDate.getMonth() &&
                        slot.startTime.getDate() === currentLoopDate.getDate()
            ).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

            week.push({
                date: new Date(currentLoopDate),
                isCurrentMonth: currentLoopDate.getMonth() === month,
                isToday: currentLoopDate.getTime() === today.getTime(),
                slots: daySlots
            });

            currentLoopDate.setDate(currentLoopDate.getDate() + 1);
        }
        weeks.push(week);
    }
    return weeks;
  });

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

  getSlotsForHour(day: CalendarDay, hour: number): TimeSlot[] {
    return day.slots.filter(slot => {
      const slotStartTime = slot.startTime.getTime();
      const slotEndTime = slot.endTime.getTime();

      const hourStart = new Date(day.date);
      hourStart.setHours(hour, 0, 0, 0);

      const hourEnd = new Date(day.date);
      hourEnd.setHours(hour + 1, 0, 0, 0);

      // Overlap check: (start1 < end2) and (end1 > start2)
      return slotStartTime < hourEnd.getTime() && slotEndTime > hourStart.getTime();
    });
  }
  
  private getGroupedActivityCounts(slot: TimeSlot): { approvedCount: number, pendingCount: number, approvedUsers: User[] } {
    const isGrouped = slot.job.isGrouped;
    const allRegistrations = this.registrations();
    
    const relevantRegistrations = isGrouped 
        ? allRegistrations.filter(r => r.job.id === slot.job.id)
        : allRegistrations.filter(r => r.slotId === slot.id);

    const approvedRegs = relevantRegistrations.filter(r => r.status === 'approved');
    const pendingRegs = relevantRegistrations.filter(r => r.status === 'pending');

    const approvedUsersMap = new Map<string, User>();
    for (const reg of approvedRegs) {
        if (!approvedUsersMap.has(reg.user.id)) {
            approvedUsersMap.set(reg.user.id, reg.user);
        }
    }
    const approvedUsers = Array.from(approvedUsersMap.values());
    const pendingUserIds = new Set(pendingRegs.map(r => r.user.id));

    return { approvedCount: approvedUsers.length, pendingCount: pendingUserIds.size, approvedUsers };
  }

  private getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
    if (!slot.requiredSkills || !user.skillsByCompany) {
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

  getSlotViewStatus(slot: TimeSlot): { status: SlotViewStatus, text: string, pendingCount: number } {
    const user = this.currentUser();
    const trans = this.t();
    if (!user) return { status: 'available', text: '', pendingCount: 0 };
    
    const isGrouped = slot.job.isGrouped;
    const allRegistrations = this.registrations();
    
    const { approvedCount, pendingCount, approvedUsers } = this.getGroupedActivityCounts(slot);

    const isUserView = !user.isGlobalAdmin && user.rolesByCompany?.[slot.job.companyId] !== 'company-admin';
    const isAdminView = !isUserView;

    if (isUserView) {
      const userRegistration = allRegistrations.find(r => r.user.id === user.id && (isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id));
      if (userRegistration) {
        switch (userRegistration.status) {
          case 'pending': return { status: 'pending', text: trans('jobDetailsModal.statusValues.pending'), pendingCount };
          case 'approved': return { status: 'booked', text: trans('jobDetailsModal.statusValues.approved'), pendingCount };
        }
      }
    }

    const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;

    if (approvedCount >= totalCapacity) {
      const text = trans('calendar.legend.admin.bookedFull');
      const status = isAdminView ? 'booked' : 'full';
      return { status, text, pendingCount };
    }
    
    if (isUserView && slot.capacityMode === 'skill' && slot.capacityBySkill && slot.requiredSkills) {
      const allApprovedRegs = allRegistrations.filter(r => 
          r.status === 'approved' && (isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
      );
      
// FIX: Explicitly type `uniqueApprovedRegs` by providing the generic type to `new Map` to resolve type inference issues.
      const uniqueApprovedRegs: Registration[] = Array.from(new Map<string, Registration>(allApprovedRegs.map((reg: Registration) => [reg.user.id, reg])).values());
  
      const skillTallies: Record<string, number> = {};
      for (const reg of uniqueApprovedRegs) {
          const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
          if (skillUsed) {
              skillTallies[skillUsed] = (skillTallies[skillUsed] || 0) + 1;
          }
      }
  
      const userSkills = user.skillsByCompany?.[slot.job.companyId] || [];
      const userEligibleSkills = slot.requiredSkills.filter(reqSkill => userSkills.includes(reqSkill));
  
      if (userEligibleSkills.length === 0) {
          return { status: 'full', text: trans('calendar.legend.user.bookedFull'), pendingCount };
      }
  
      const hasCapacityInAnySkill = userEligibleSkills.some(skill => {
          const tally = skillTallies[skill] || 0;
          const capacity = slot.capacityBySkill![skill] || 0;
          return tally < capacity;
      });
  
      if (!hasCapacityInAnySkill) {
          return { status: 'full', text: trans('calendar.legend.user.bookedFull'), pendingCount };
      }
    }

    const availableSlots = totalCapacity - approvedCount;
    const availableText = isUserView
      ? trans('calendar.legend.user.available')
      : `${trans('calendar.legend.admin.available')} (${availableSlots}/${totalCapacity})`;

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

  getSlotDisplayTitle(slot: TimeSlot): string {
    const user = this.currentUser();
    if (!user) return slot.job.title;
    
    const isAdminForThisSlot = this.isUserAdminFor(slot);

    if (!isAdminForThisSlot && slot.job.hideTitleFromUser) {
        return this.t()('calendar.hiddenActivityName');
    }
    return slot.job.title;
  }

  selectSlot(slot: TimeSlot) {
    this.slotSelected.emit(slot);
  }

  setViewMode(mode: 'hourly' | 'daily' | 'monthly') {
    this.calendarViewMode.set(mode);
  }

  goToPreviousWeek() {
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(d.getDate() - 7);
      return newDate;
    });
  }

  goToNextWeek() {
    this.currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(d.getDate() + 7);
      return newDate;
    });
  }

  goToPreviousMonth() {
    this.currentDate.update(d => {
        const newDate = new Date(d);
        newDate.setMonth(d.getMonth() - 1);
        return newDate;
    });
  }

  goToNextMonth() {
    this.currentDate.update(d => {
        const newDate = new Date(d);
        newDate.setMonth(d.getMonth() + 1);
        return newDate;
    });
  }

  goToToday() {
    this.currentDate.set(new Date());
  }

  formatTime(hour: number): string {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let displayHour = hour % 12;
    if (displayHour === 0) {
      displayHour = 12;
    }
    return `${displayHour}:00 ${ampm}`;
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

  private isSlotInPast(slot: TimeSlot): boolean {
    return new Date(slot.endTime).getTime() < new Date().getTime();
  }

  getSlotClasses(slot: TimeSlot | undefined): string {
    if (!slot) {
      return 'bg-gray-100/50 border-transparent';
    }
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

  openDayPopup(day: CalendarDay | MonthDay) {
    if (day.slots.length === 0) return;
    this.popupDayData.set({ date: day.date, slots: day.slots });
    this.isDayPopupOpen.set(true);
  }

  closeDayPopup() {
    this.isDayPopupOpen.set(false);
    this.popupDayData.set(null);
  }

  handleSlotSelectedFromPopup(slot: TimeSlot) {
    this.closeDayPopup();
    this.selectSlot(slot);
  }
}
