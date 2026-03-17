import { Component, ChangeDetectionStrategy, signal, inject, computed, OnInit, OnDestroy, ElementRef, viewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { CalendarComponent } from '../calendar/calendar.component';
import { JobDetailsModalComponent } from '../job-details-modal/job-details-modal.component';
import { JobService } from '../../services/job.service';
import { NotificationService } from '../../services/notification.service';
import { TimeSlot } from '../../models/timeslot.model';
import { AuthService } from '../../services/auth.service';
import { ManageRequestsComponent } from '../admin/manage-requests/manage-requests.component';
import { RegisterActivityComponent } from '../admin/register-activity/register-activity.component';
import { RegisterUserComponent } from '../admin/register-user/register-user.component';
import { Registration } from '../../models/registration.model';
import { ManageCompaniesComponent } from '../admin/manage-companies/manage-companies.component';
import { ProfileModalComponent } from '../profile-modal/profile-modal.component';
import { User } from '../../models/user.model';
import { ManageCompanyProfileComponent } from '../admin/manage-company-profile/manage-company-profile.component';
import { TranslationService } from '../../services/translation.service';
import { LanguageSelectorComponent } from '../language-selector/language-selector.component';
import { ManageSkillsComponent } from '../admin/manage-skills/manage-skills.component';
import { AboutModalComponent } from '../about-modal/about-modal.component';
import { ManageAboutComponent } from '../admin/manage-about/manage-about.component';
import { AboutService } from '../../services/about.service';
import { DataPersistenceService } from '../../services/data-persistence.service';
import { Company } from '../../models/company.model';
import { GeneralReportComponent } from '../admin/general-report/general-report.component';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';
import { ActivityListComponent } from '../activity-list/activity-list.component';
import { AuditLogComponent } from '../admin/audit-log/audit-log.component';
import { FinancialReportComponent } from '../admin/financial-report/financial-report.component';

type AdminView = 'requests' | 'new-activity' | 'manage-users' | 'manage-calendar' | 'manage-companies' | 'manage-company-profile' | 'manage-skills' | 'manage-about' | 'general-report' | 'financial-report' | 'audit-log';

interface AdminMenuItem {
  view: AdminView;
  labelKey: string;
  iconPath: string;
  requiresGlobalAdmin: boolean;
}

@Component({
  selector: 'app-portal',
  imports: [
    CommonModule,
    CalendarComponent,
    ActivityListComponent,
    JobDetailsModalComponent,
    ManageRequestsComponent,
    RegisterActivityComponent,
    RegisterUserComponent,
    ManageCompaniesComponent,
    ProfileModalComponent,
    ManageCompanyProfileComponent,
    LanguageSelectorComponent,
    ManageSkillsComponent,
    AboutModalComponent,
    ManageAboutComponent,
    GeneralReportComponent,
    ConfirmationModalComponent,
    AuditLogComponent,
    FinancialReportComponent,
  ],
  templateUrl: './portal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class PortalComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  jobService = inject(JobService);
  translationService = inject(TranslationService);
  aboutService = inject(AboutService);
  t = this.translationService.t;
  private notificationService = inject(NotificationService);
  private dataPersistence = inject(DataPersistenceService);

  isModalOpen = signal(false);
  selectedSlot = signal<TimeSlot | null>(null);
  adminView = signal<AdminView>('requests');
  userViewMode = signal<'list' | 'calendar'>('list');
  slotToEdit = signal<TimeSlot | null>(null);

  // User filters
  filterTitle = signal<string>('');
  filterCompanyId = signal<string>('all');
  filterLocation = signal<string>('');
  filterStatus = signal<string>('all');
  filterSkill = signal<string>('all');
  
  // Admin filters
  adminFilterStartDate = signal<string>('');
  adminFilterEndDate = signal<string>('');
  adminFilterStatus = signal<string>('all');
  adminFilterTitle = signal<string>('');
  adminFilterCompanyId = signal<string>('all');
  adminFilterIsGrouped = signal<'all' | 'yes' | 'no'>('all');
  adminFilterNeedsTransportation = signal<'all' | 'yes' | 'no'>('all');
  adminFilterSkill = signal<string>('all');
  adminFilterUserId = signal<string>('all');
  
  // UI State
  isLoading = signal(true);
  showNotifications = signal(false);
  showUserMenu = signal(false);
  isProfileModalOpen = signal(false);
  isAboutModalOpen = signal(false);
  isFilterPanelVisible = signal(false);
  isMobileMenuOpen = signal(false);
  isOffline = this.dataPersistence.isOffline;
  
  // Hire Limit Confirmation Modal state
  showHireLimitConfirm = signal(false);
  pendingApprovals = signal<({ registration: Registration, comment: string, selectedSkill?: string })[]>([]);
  limitDetails = signal<{ message: string } | null>(null);

  currentUser = this.authService.currentUser;
  currentYear = new Date().getFullYear();

  // Banner Carousel State
  currentBannerIndex = signal(0);
  private bannerInterval: any;

  // Click outside references
  userMenuContainer = viewChild<ElementRef>('userMenuContainer');
  notificationsContainer = viewChild<ElementRef>('notificationsContainer');
  userMenuButton = viewChild<ElementRef>('userMenuButton');
  notificationsButton = viewChild<ElementRef>('notificationsButton');

  areUserFiltersActive = computed(() => {
    return this.filterTitle() !== '' ||
           this.filterCompanyId() !== 'all' ||
           this.filterLocation() !== '' ||
           this.filterStatus() !== 'all' ||
           this.filterSkill() !== 'all';
  });

  areAdminFiltersActive = computed(() => {
    return this.adminFilterStartDate() !== '' ||
           this.adminFilterEndDate() !== '' ||
           this.adminFilterStatus() !== 'all' ||
           this.adminFilterTitle() !== '' ||
           this.adminFilterCompanyId() !== 'all' ||
           this.adminFilterIsGrouped() !== 'all' ||
           this.adminFilterNeedsTransportation() !== 'all' ||
           this.adminFilterSkill() !== 'all' ||
           this.adminFilterUserId() !== 'all';
  });

  adminVisibleCompanies = computed<Company[]>(() => {
    const user = this.currentUser();
    const allCompanies = this.jobService.companies();

    if (!user) {
      return [];
    }

    if (user.isGlobalAdmin) {
      return allCompanies;
    }

    // Show only companies where the user has the 'company-admin' role
    const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
      id => user.rolesByCompany![id] === 'company-admin'
    );
    return allCompanies.filter(c => adminCompanyIds.includes(c.id));
  });

  adminVisibleSkills = computed(() => {
    const visibleCompanyIds = new Set(this.adminVisibleCompanies().map(c => c.id));
    return this.jobService.skills().filter(s => visibleCompanyIds.has(s.companyId));
  });

  visibleEndUsers = computed<User[]>(() => {
    const admin = this.currentUser();
    const allUsers = this.authService.users();

    if (!admin) {
      return [];
    }

    if (admin.isGlobalAdmin) {
      // For a global admin, an "End User" is anyone who is not a global or company admin.
      return this.authService.endUsers();
    }

    // For a Company Admin, an "End User" is any user (who is not the admin themselves) 
    // for whom they have oversight, specifically where the user has the 'user' role.
    const adminManagedCompanyIds = new Set(this.adminVisibleCompanies().map(c => c.id));
    if (adminManagedCompanyIds.size === 0) {
      return [];
    }
    
    return allUsers.filter(user => {
      if (user.id === admin.id) {
        return false;
      }

      const userCompanyIds = user.companyIds ?? [];
      // The user must be associated with at least one of the admin's managed companies
      // AND have the role of 'user' for that specific company.
      return userCompanyIds.some(
        companyId => 
          adminManagedCompanyIds.has(companyId) && 
          user.rolesByCompany?.[companyId] === 'user'
      );
    });
  });

  userVisibleCompanies = computed<Company[]>(() => {
    const user = this.currentUser();
    if (!user || !user.companyIds) return [];
    return this.jobService.companies().filter(c => user.companyIds!.includes(c.id)).sort((a,b) => a.name.localeCompare(b.name));
  });

  userVisibleSkills = computed(() => {
    const user = this.currentUser();
    if (!user) {
      return [];
    }
    const userCompanyIds = new Set(user.companyIds ?? []);
    return this.jobService.skills().filter(s => userCompanyIds.has(s.companyId));
  });

  userSkillFilterOptions = computed(() => {
    const selectedCompanyId = this.filterCompanyId();
    let skills = this.userVisibleSkills();

    // If a specific company is selected in the filter, only show skills for that company.
    if (selectedCompanyId !== 'all') {
      skills = skills.filter(skill => skill.companyId === selectedCompanyId);
    }
    
    const companies = this.userVisibleCompanies();
    const companiesMap = new Map(this.jobService.companies().map(c => [c.id, c.name]));
    const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));
    
    // Show company name in the skill label only if the user is associated with multiple companies AND "All Companies" is selected.
    const showCompanyInLabel = companies.length > 1 && selectedCompanyId === 'all';

    if (!showCompanyInLabel) {
        return sortedSkills.map(skill => ({
            id: skill.id,
            value: skill.name,
            label: skill.name
        }));
    }

    return sortedSkills.map(skill => {
        const companyName = companiesMap.get(skill.companyId) || '...';
        return {
            id: skill.id,
            value: skill.name,
            label: `${skill.name} (${companyName})`
        };
    });
  });
  
  userStatusFilterOptions = computed(() => {
    const t = this.t();
    const options = [
      { value: 'all', label: t('portal.user.filters.allStatuses') },
      { value: 'available', label: t('portal.user.filters.available') },
      { value: 'pending', label: t('portal.user.filters.myPending') },
      { value: 'booked', label: t('portal.user.filters.myBooked') },
    ];

    if (this.userViewMode() === 'calendar') {
      return options.filter(opt => opt.value !== 'available');
    }

    return options;
  });

  companyBanners = computed(() => {
    const user = this.currentUser();
    const aboutImage = this.aboutService.aboutImageUrl();

    if (!user) {
      return [];
    }
    
    const userCompanyIds = user.companyIds ?? [];
    
    // Get banner URLs from associated companies that have one
    const companyBannerUrls = this.jobService.companies()
      .filter(c => userCompanyIds.includes(c.id) && c.bannerImageUrl)
      .map(c => c.bannerImageUrl!);

    // If there are no company-specific banners to show for this user
    if (companyBannerUrls.length === 0) {
      // Show only the default "About" image as a fallback.
      // This covers users with no companies, users whose companies have no banners,
      // and admin users (who have no associated companies).
      return [aboutImage];
    }
    
    // If there are company banners, create a carousel that includes the "About" image.
    // Using a Set prevents duplicates.
    const allBanners = new Set([aboutImage, ...companyBannerUrls]);
    
    return Array.from(allBanners);
  });
  
  adminMenuItems = computed<AdminMenuItem[]>(() => {
    const allItems: AdminMenuItem[] = [
      { view: 'requests', labelKey: 'portal.admin.tabs.manageRequests', iconPath: 'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125', requiresGlobalAdmin: false },
      { view: 'manage-calendar', labelKey: 'portal.admin.tabs.manageCalendar', iconPath: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0h18', requiresGlobalAdmin: false },
      { view: 'general-report', labelKey: 'portal.admin.tabs.generalReport', iconPath: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z', requiresGlobalAdmin: false },
      { view: 'financial-report', labelKey: 'portal.admin.tabs.financialReport', iconPath: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 11.249 12.768 11 12 11c-.768 0-1.536.249-2.121.737L9 12.218z', requiresGlobalAdmin: false },
      { view: 'new-activity', labelKey: 'portal.admin.tabs.registerNewActivity', iconPath: 'M12 4.5v15m7.5-7.5h-15', requiresGlobalAdmin: false },
      { view: 'manage-users', labelKey: 'portal.admin.tabs.manageUsers', iconPath: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-2.43M15 19.128v-3.873a3.375 3.375 0 00-3-3.375h-3a3.375 3.375 0 00-3 3.375v3.873M15 19.128A9.37 9.37 0 0012 21a9.37 9.37 0 00-3-1.872M15 19.128v-3.873a3.375 3.375 0 00-3-3.375h-3a3.375 3.375 0 00-3 3.375v3.873M9 8.25a3 3 0 100-6 3 3 0 000 6z', requiresGlobalAdmin: false },
      { view: 'manage-skills', labelKey: 'portal.admin.tabs.manageSkills', iconPath: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.471-2.471a.563.563 0 01.8 0l2.47 2.471a.563.563 0 010 .8L14.47 18.4a.563.563 0 01-.8 0l-2.471-2.47zM11.42 15.17L5.877 21A2.652 2.652 0 012 17.25l5.877-5.877m0 0a.563.563 0 010 .8l2.47 2.471a.563.563 0 01.8 0l2.471-2.471a.563.563 0 01.8 0M12 2.25a.75.75 0 00-1.5 0v2.25a.75.75 0 001.5 0V2.25zM15.36 6.14a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.06l1.591-1.59zM21.75 12a.75.75 0 00-1.5 0h2.25a.75.75 0 00-1.5 0h-2.25zM15.36 17.86a.75.75 0 001.06 1.06l1.591-1.59a.75.75 0 10-1.06-1.06l-1.591 1.59zM12 21.75a.75.75 0 001.5 0v-2.25a.75.75 0 00-1.5 0v2.25zM4.64 17.86a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.06 1.06l1.59 1.59zM2.25 12a.75.75 0 00-1.5 0h2.25a.75.75 0 00-1.5 0H.75zM4.64 6.14a.75.75 0 00-1.06 1.06l1.59 1.591a.75.75 0 101.06-1.06l-1.59-1.59z', requiresGlobalAdmin: false },
      { view: 'manage-companies', labelKey: 'portal.admin.tabs.manageCompanies', iconPath: 'M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h6M9 10.5h6M9 14.25h6M9 18h6', requiresGlobalAdmin: true },
      { view: 'audit-log', labelKey: 'portal.admin.tabs.auditLog', iconPath: 'M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3', requiresGlobalAdmin: true },
      { view: 'manage-about', labelKey: 'portal.admin.tabs.manageAbout', iconPath: 'M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z', requiresGlobalAdmin: true },
    ];
    
    const user = this.authService.currentUser();
    if (user?.isGlobalAdmin) {
      return allItems;
    }
    return allItems.filter(item => !item.requiresGlobalAdmin);
  });
  
  adminViewLabel = computed(() => {
    const view = this.adminView();
    const item = this.adminMenuItems().find(i => i.view === view);
    return item ? this.t()(item.labelKey) : '';
  });

  constructor() {
    effect(() => {
      // This effect runs whenever adminView changes.
      this.adminView(); // Establish dependency on the signal.
      
      // Reset filters to ensure they are not shared between views.
      this.resetAdminFilters(); 
      
      // Also hide the filter panel on tab switch for a cleaner experience.
      this.isFilterPanelVisible.set(false);
    });
    
    effect(() => {
      const view = this.userViewMode();
      if (view === 'calendar' && this.filterStatus() === 'available') {
        this.filterStatus.set('all');
      }
    });

    effect(() => {
      // When the company filter changes, reset the skill filter to 'all'.
      // This prevents an invalid state where a skill from one company is selected
      // while the filter is set to another company.
      this.filterCompanyId(); // Establish dependency
      this.filterSkill.set('all');
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    // Data is now loaded synchronously by DataPersistenceService on startup.
    // We just need to turn off the loading spinner.
    // A small timeout can prevent content flashing.
    setTimeout(() => {
      this.isLoading.set(false);
      this.startBannerCarousel();
    }, 200);
  }

  ngOnDestroy() {
    this.stopBannerCarousel();
  }

  onDocumentClick(event: MouseEvent) {
    const target = event.target as Node;

    // Check for user menu
    if (this.showUserMenu()) {
      const buttonEl = this.userMenuButton()?.nativeElement;
      const containerEl = this.userMenuContainer()?.nativeElement;
      if (buttonEl && !buttonEl.contains(target) && containerEl && !containerEl.contains(target)) {
        this.showUserMenu.set(false);
      }
    }

    // Check for notifications
    if (this.showNotifications()) {
      const buttonEl = this.notificationsButton()?.nativeElement;
      const containerEl = this.notificationsContainer()?.nativeElement;
      if (buttonEl && !buttonEl.contains(target) && containerEl && !containerEl.contains(target)) {
        this.showNotifications.set(false);
      }
    }
  }
  
  setAdminView(view: AdminView) {
    this.adminView.set(view);
    this.isMobileMenuOpen.set(false);
  }

  toggleUserMenu() {
    this.showUserMenu.update(v => !v);
    this.showNotifications.set(false);
  }

  toggleNotifications() {
    this.showNotifications.update(v => !v);
    this.showUserMenu.set(false);
  }
  
  openProfileModal() {
    this.isProfileModalOpen.set(true);
    this.showUserMenu.set(false);
  }

  closeProfileModal() {
    this.isProfileModalOpen.set(false);
  }

  openAboutModal() {
    this.isAboutModalOpen.set(true);
    this.showUserMenu.set(false);
  }
  
  closeAboutModal() {
    this.isAboutModalOpen.set(false);
  }

  resetAdminFilters() {
    this.adminFilterStartDate.set('');
    this.adminFilterEndDate.set('');
    this.adminFilterStatus.set('all');
    this.adminFilterTitle.set('');
    this.adminFilterCompanyId.set('all');
    this.adminFilterIsGrouped.set('all');
    this.adminFilterNeedsTransportation.set('all');
    this.adminFilterSkill.set('all');
    this.adminFilterUserId.set('all');
  }

  resetUserFilters() {
    this.filterTitle.set('');
    this.filterCompanyId.set('all');
    this.filterLocation.set('');
    this.filterStatus.set('all');
    this.filterSkill.set('all');
  }

  private startBannerCarousel() {
    if (this.companyBanners().length > 1) {
      this.bannerInterval = setInterval(() => {
        this.nextBanner();
      }, 5000); // Change banner every 5 seconds
    }
  }

  private stopBannerCarousel() {
    if (this.bannerInterval) {
      clearInterval(this.bannerInterval);
    }
  }

  nextBanner() {
    this.currentBannerIndex.update(i => (i + 1) % this.companyBanners().length);
  }

  previousBanner() {
    this.currentBannerIndex.update(i => (i - 1 + this.companyBanners().length) % this.companyBanners().length);
  }

  goToBanner(index: number) {
    this.currentBannerIndex.set(index);
  }

  handleSlotSelected(slot: TimeSlot) {
    this.selectedSlot.set(slot);
    this.isModalOpen.set(true);
  }

  handleCloseModal() {
    this.isModalOpen.set(false);
    this.selectedSlot.set(null);
  }

  handleRequestSlot(registrationData: { slotId: string; needsTransportation: boolean; transportationNotes: string; selectedSkill?: string; }) {
    const user = this.currentUser();
    if (user) {
      this.jobService.requestSlot(registrationData.slotId, user, registrationData, registrationData.selectedSkill).subscribe({
        next: () => this.handleCloseModal()
      });
    }
  }
  
  handleQuickRegister(registrationData: { slotId: string; selectedSkill?: string }) {
    const user = this.currentUser();
    if (user) {
      // For quick register, assume no transportation is needed.
      const transportData = { needsTransportation: false, transportationNotes: '' };
      this.jobService.requestSlot(registrationData.slotId, user, transportData, registrationData.selectedSkill).subscribe();
    }
  }

  handleCancelRequest(registration: Registration) {
    this.jobService.cancelSlotRequest(registration.id).subscribe({
      next: () => this.handleCloseModal()
    });
  }
  
  handleQuickCancel(registration: Registration) {
    this.jobService.cancelSlotRequest(registration.id).subscribe();
  }

  handleEditSlot(slot: TimeSlot) {
    this.slotToEdit.set(slot);
    this.adminView.set('new-activity');
    this.handleCloseModal();
  }

  handleDeleteSlot(slotId: string) {
    this.jobService.deleteSlot(slotId).subscribe({
      next: () => this.handleCloseModal()
    });
  }

  handleApproveRequest({ registration, comment, selectedSkill }: { registration: Registration; comment: string; selectedSkill?: string }) {
    this.handleApproveBatch([{ registration, comment, selectedSkill }]);
  }

  handleApproveBatch(approvals: { registration: Registration, comment: string, selectedSkill?: string }[]) {
    const safeToApprove: typeof approvals = [];
    const needsConfirmation: typeof approvals = [];

    approvals.forEach(approval => {
      const limitCheck = this.jobService.checkMonthlyHiresLimit(approval.registration);
      if (limitCheck.limitExceeded) {
        needsConfirmation.push(approval);
      } else {
        safeToApprove.push(approval);
      }
    });

    // Immediately approve those who don't exceed the limit
    safeToApprove.forEach(approval => {
      this.jobService.approveSlotRequest(approval.registration.id, approval.comment, approval.selectedSkill).subscribe({ error: () => {} });
    });
    
    // Handle those who need confirmation
    if (needsConfirmation.length > 0) {
      this.pendingApprovals.set(needsConfirmation);
      let message: string;
      if (needsConfirmation.length === 1) {
        const approval = needsConfirmation[0];
        const limitCheck = this.jobService.checkMonthlyHiresLimit(approval.registration);
        message = this.t()('confirmationModal.messages.hireLimitExceeded', {
          limit: limitCheck.limit,
          count: limitCheck.currentCount
        });
      } else {
        const names = needsConfirmation.map(a => a.registration.user.name).join(', ');
        message = this.t()('confirmationModal.messages.hireLimitExceededBatch', {
          count: needsConfirmation.length,
          names: names
        });
      }
      this.limitDetails.set({ message });
      this.showHireLimitConfirm.set(true);
    }
  }

  confirmLimitedApproval() {
    const approvals = this.pendingApprovals();
    if (approvals.length > 0) {
      approvals.forEach(approval => {
        this.jobService.approveSlotRequest(approval.registration.id, approval.comment, approval.selectedSkill).subscribe({
          error: () => {}
        });
      });
    }
    this.cancelLimitedApproval();
  }
  
  cancelLimitedApproval() {
    this.showHireLimitConfirm.set(false);
    this.pendingApprovals.set([]);
    this.limitDetails.set(null);
  }

  onActivitySaved() {
    // When an activity that was opened for editing from another view (like the calendar)
    // is saved, switch back to the calendar view and clear the editing state.
    this.adminView.set('manage-calendar');
    this.slotToEdit.set(null);
  }

  handleUserUpdated(user: User) {
    this.authService.updateUser(user).subscribe({
      next: () => {
        this.notificationService.show('notifications.profileUpdateSuccess');
        this.isProfileModalOpen.set(false);
      }
    });
  }

  clearNotifications() {
    const user = this.currentUser();
    if (user) {
      this.authService.clearNotifications(user.id);
    }
  }
}
