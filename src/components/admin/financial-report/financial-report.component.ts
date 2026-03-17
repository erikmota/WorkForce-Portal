import { Component, ChangeDetectionStrategy, computed, inject, input, output, effect, viewChild, ElementRef, AfterViewInit, OnDestroy, signal } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { JobService } from '../../../services/job.service';
import { AuthService } from '../../../services/auth.service';
import { TimeSlot } from '../../../models/timeslot.model';
import { TranslationService } from '../../../services/translation.service';
import { User } from '../../../models/user.model';
import { NotificationService } from '../../../services/notification.service';
import { Registration } from '../../../models/registration.model';
import { Company } from '../../../models/company.model';

declare var d3: any;

@Component({
  selector: 'app-financial-report',
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './financial-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe, CurrencyPipe]
})
export class FinancialReportComponent implements AfterViewInit, OnDestroy {
  jobService = inject(JobService);
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  notificationService = inject(NotificationService);
  datePipe = inject(DatePipe);
  currencyPipe = inject(CurrencyPipe);
  t = this.translationService.t;

  slotClicked = output<TimeSlot>();

  private costByCompanyChartContainer = viewChild<ElementRef>('costByCompanyChart');
  private costBySkillChartContainer = viewChild<ElementRef>('costBySkillChart');
  private resizeObserver!: ResizeObserver;
  
  public viewMode = signal<'byActivity' | 'byUser'>('byActivity');
  expandedRows = signal(new Set<string>());

  // Filters from parent
  titleFilter = input<string>('');
  companyIdFilter = input<string>('all');
  startDateFilter = input<string>('');
  endDateFilter = input<string>('');
  isGroupedFilter = input<'all' | 'yes' | 'no'>('all');
  needsTransportationFilter = input<'all' | 'yes' | 'no'>('all');
  skillFilter = input<string>('all');
  userIdFilter = input<string>('all');
  statusFilter = input<string>('all');

  currentUser = this.authService.currentUser;
  
  public adminVisibleCompanies = computed<Company[]>(() => {
    const user = this.authService.currentUser();
    const allCompanies = this.jobService.companies();
    if (!user) return [];
    if (user.isGlobalAdmin) return allCompanies;
    const adminCompanyIds = Object.keys(user.rolesByCompany ?? {}).filter(
      id => user.rolesByCompany![id] === 'company-admin'
    );
    return allCompanies.filter(c => adminCompanyIds.includes(c.id));
  });

  public shouldShowCompanyChart = computed<boolean>(() => {
      const user = this.authService.currentUser();
      if (!user) return false;
      if (user.isGlobalAdmin) return true;
      return this.adminVisibleCompanies().length > 1;
  });

  filteredActivities = computed<TimeSlot[]>(() => {
    const user = this.currentUser();
    if (!user) return [];
    
    let allSlots = this.jobService.timeSlots();

    // Role filter
    if (!user.isGlobalAdmin) {
       allSlots = allSlots.filter(slot => {
        const roleForCompany = user.rolesByCompany?.[slot.job.companyId];
        return roleForCompany === 'company-admin';
      });
    }

    // Apply activity-specific filters
    const title = this.titleFilter().toLowerCase();
    const companyId = this.companyIdFilter();
    const isGrouped = this.isGroupedFilter();
    const transportFilter = this.needsTransportationFilter();
    const status = this.statusFilter();

    const startDate = this.startDateFilter();
    const endDate = this.endDateFilter();
    const startTime = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const endTime = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
    
    return allSlots.filter(slot => {
        const titleMatch = title ? slot.job.title.toLowerCase().includes(title) : true;
        const companyIdMatch = companyId !== 'all' ? slot.job.companyId === companyId : true;
        const groupedMatch = isGrouped === 'all' 
          ? true 
          : (isGrouped === 'yes' ? !!slot.job.isGrouped : !slot.job.isGrouped);
        
        const transportMatch = transportFilter === 'all'
          ? true
          : (transportFilter === 'yes' ? !!slot.job.offersTransportation : !slot.job.offersTransportation);

        let statusMatch = true;
        if (status && status !== 'all') {
            const { approvedCount, pendingCount } = this.getGroupedActivityCounts(slot);
            const totalCapacity = this.getTotalCapacity(slot);

            switch (status) {
              case 'available':
                statusMatch = approvedCount < totalCapacity && pendingCount === 0;
                break;
              case 'booked': 
                statusMatch = approvedCount >= totalCapacity;
                break;
              case 'pending':
                statusMatch = pendingCount > 0;
                break;
              default:
                statusMatch = true;
            }
        }

        let dateMatch = true;
        if (startTime > 0 || endTime < Infinity) {
          const slotTime = slot.startTime.getTime();
          dateMatch = slotTime >= startTime && slotTime <= endTime;
        }
        
        return titleMatch && companyIdMatch && groupedMatch && transportMatch && dateMatch && statusMatch;
    });
  });

  public filteredApprovedRegistrations = computed<Registration[]>(() => {
    const validActivityKeys = new Set(this.filteredActivities().map(s => s.job.isGrouped ? s.job.id : s.id));
    const allSlots = this.jobService.timeSlots();

    const userId = this.userIdFilter();
    const skill = this.skillFilter();

    return this.jobService.registrations().filter(reg => {
      if (reg.status !== 'approved' || !reg.user.dailyRate || reg.user.dailyRate <= 0) {
        return false;
      }
      
      const activityKey = reg.job.isGrouped ? reg.job.id : reg.slotId;
      if (!validActivityKeys.has(activityKey)) {
        return false;
      }
      
      if (userId !== 'all' && reg.user.id !== userId) {
        return false;
      }
      
      if (skill !== 'all') {
        const slot = allSlots.find(s => s.id === reg.slotId);
        if (!slot) return false;
        const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
        if (skillUsed !== skill) {
            return false;
        }
      }

      return true;
    });
  });

  public managerialReportRows = computed(() => {
    const approvedRegs = this.filteredApprovedRegistrations();
    const activityMap = new Map<string, { slot: TimeSlot, regs: Registration[] }>();

    for (const reg of approvedRegs) {
      const key = reg.job.isGrouped ? reg.job.id : reg.slotId;
      if (!activityMap.has(key)) {
        const representativeSlot = this.jobService.timeSlots().find(s => s.id === reg.slotId);
        if(representativeSlot) {
            activityMap.set(key, { slot: representativeSlot, regs: [] });
        }
      }
      const entry = activityMap.get(key);
      if(entry) {
          // For financial reports, we need every registration, not just unique users per activity.
          entry.regs.push(reg);
      }
    }

    const rows = Array.from(activityMap.values()).map(({ slot, regs }) => {
        regs.sort((a,b) => a.user.name.localeCompare(b.user.name));
        
        // For grouped activities, each user is paid for each day they are registered
        const paymentMap = new Map<string, number>(); // userId -> count of days
        if (slot.job.isGrouped) {
            const allRegsForJob = this.jobService.registrations().filter(r => r.job.id === slot.job.id && r.status === 'approved');
            for(const reg of regs) {
                const userDays = new Set<string>();
                allRegsForJob.filter(r => r.user.id === reg.user.id).forEach(r => {
                    userDays.add(this.datePipe.transform(r.startTime, 'yyyy-MM-dd')!);
                });
                paymentMap.set(reg.user.id, userDays.size);
            }
        }
        
        const uniqueRegsForDisplay = Array.from(new Map(regs.map(r => [r.user.id, r])).values());

        return {
            isGroup: slot.job.isGrouped,
            jobTitle: slot.job.title,
            startDate: slot.startTime,
            approvedRegs: uniqueRegsForDisplay,
            approvedUserNames: this.getApprovedUserNames(uniqueRegsForDisplay),
            totalValue: regs.reduce((sum, reg) => {
                const days = slot.job.isGrouped ? (paymentMap.get(reg.user.id) || 1) : 1;
                return sum + ((reg.user.dailyRate || 0) * days);
            }, 0),
            key: slot.job.isGrouped ? slot.job.id : slot.id,
            slot: slot,
        };
    });

    return rows.sort((a, b) => {
      const dateComparison = a.startDate.getTime() - b.startDate.getTime();
      if (dateComparison !== 0) {
        return dateComparison;
      }
      return a.jobTitle.localeCompare(b.jobTitle);
    });
  });
  
  public userReportRows = computed(() => {
    const approvedRegs = this.filteredApprovedRegistrations();
    const userMap = new Map<string, { user: User, activities: Registration[], totalValue: number }>();

    const uniqueUserDayJob = new Set<string>();
    const validRegistrationsForPayment: Registration[] = [];

    for (const reg of approvedRegs) {
        const dateString = this.datePipe.transform(reg.startTime, 'yyyy-MM-dd');
        const key = `${reg.user.id}-${reg.job.id}-${dateString}`;
        if (!uniqueUserDayJob.has(key)) {
            uniqueUserDayJob.add(key);
            validRegistrationsForPayment.push(reg);
        }
    }

    for (const reg of validRegistrationsForPayment) {
        if (!userMap.has(reg.user.id)) {
            userMap.set(reg.user.id, { user: reg.user, activities: [], totalValue: 0 });
        }
        const entry = userMap.get(reg.user.id)!;
        entry.activities.push(reg);
        entry.totalValue += reg.user.dailyRate || 0;
    }
    
    const rows = Array.from(userMap.values());
    rows.forEach(row => row.activities.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()));
    return rows.sort((a, b) => a.user.name.localeCompare(b.user.name));
  });
  
  public reportTotals = computed(() => {
    const approvedRegs = this.filteredApprovedRegistrations();
    if (!approvedRegs) return null;

    const allApprovedUsers = new Set<string>();
    const allActivityKeys = new Set<string>();
    
    const uniqueUserDayJob = new Set<string>(); // "userId-jobId-YYYY-MM-DD"
    let totalAmount = 0;

    for (const reg of approvedRegs) {
        allApprovedUsers.add(reg.user.id);
        allActivityKeys.add(reg.job.isGrouped ? reg.job.id : reg.slotId);

        const dateString = this.datePipe.transform(reg.startTime, 'yyyy-MM-dd');
        const paymentKey = `${reg.user.id}-${reg.job.id}-${dateString}`;
        if (!uniqueUserDayJob.has(paymentKey)) {
            uniqueUserDayJob.add(paymentKey);
            totalAmount += reg.user.dailyRate || 0;
        }
    }

    return {
        totalAmount: totalAmount,
        totalApprovedUsers: allApprovedUsers.size,
        totalActivities: allActivityKeys.size,
    };
  });

  public reportStats = computed(() => {
    const totals = this.reportTotals();
    if (!totals) {
        return { totalActivities: 0, totalApprovedUsers: 0, totalAmount: 0 };
    }
    return totals;
  });

  public costByCompanyChartData = computed(() => {
    const data = new Map<string, number>();
    const uniqueUserDayJob = new Set<string>();
    for (const reg of this.filteredApprovedRegistrations()) {
      const dateString = this.datePipe.transform(reg.startTime, 'yyyy-MM-dd');
      const paymentKey = `${reg.user.id}-${reg.job.id}-${dateString}`;
      if (!uniqueUserDayJob.has(paymentKey)) {
          uniqueUserDayJob.add(paymentKey);
          const companyName = reg.job.companyName;
          const cost = reg.user.dailyRate || 0;
          data.set(companyName, (data.get(companyName) || 0) + cost);
      }
    }
    return Array.from(data, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });
  
  public costBySkillChartData = computed(() => {
    const data = new Map<string, number>();
    const uniqueUserDayJob = new Set<string>();
    const allSlots = this.jobService.timeSlots();

    for (const reg of this.filteredApprovedRegistrations()) {
      const dateString = this.datePipe.transform(reg.startTime, 'yyyy-MM-dd');
      const paymentKey = `${reg.user.id}-${reg.job.id}-${dateString}`;
      
      if (!uniqueUserDayJob.has(paymentKey)) {
        uniqueUserDayJob.add(paymentKey);

        const slot = allSlots.find(s => s.id === reg.slotId);
        if (slot) {
          const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
          if (skillUsed) {
            const cost = reg.user.dailyRate || 0;
            data.set(skillUsed, (data.get(skillUsed) || 0) + cost);
          }
        }
      }
    }
    return Array.from(data, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });

  constructor() {
    effect(() => {
      this.drawCostByCompanyChart(this.costByCompanyChartData());
      this.drawCostBySkillChart(this.costBySkillChartData());
    });
  }

  ngAfterViewInit(): void {
    const container = document.querySelector('#financial-report-section');
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.drawCostByCompanyChart(this.costByCompanyChartData());
        this.drawCostBySkillChart(this.costBySkillChartData());
      });
      this.resizeObserver.observe(container);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private drawCostByCompanyChart(data: { name: string, value: number }[]): void {
    const container = this.costByCompanyChartContainer()?.nativeElement;
    if (!container || !data || data.length === 0) {
      d3.select(container).select('svg').remove();
      return;
    }

    const margin = { top: 20, right: 30, bottom: 40, left: 100 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    d3.select(container).select('svg').remove();

    const svg = d3.select(container).append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);
    
    const y = d3.scaleBand()
      .range([0, height])
      .domain(data.map((d: any) => d.name))
      .padding(0.1);

    svg.append('g')
      .call(d3.axisLeft(y));

    const maxValue = d3.max(data, (d: any) => d.value) || 0;
    const x = d3.scaleLinear()
      .domain([0, maxValue * 1.25])
      .range([0, width]);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.format("$,.0f")));

    svg.selectAll('myRect')
      .data(data)
      .join('rect')
      .attr('x', x(0) )
      .attr('y', (d: any) => y(d.name))
      .attr('width', (d: any) => x(d.value))
      .attr('height', y.bandwidth())
      .attr('fill', '#6366f1');

    svg.selectAll('.bar-label')
      .data(data)
      .join('text')
        .attr('class', 'bar-label')
        .attr('x', (d: any) => x(d.value) + 5)
        .attr('y', (d: any) => y(d.name) + y.bandwidth() / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', 'start')
        .style('font-size', '10px')
        .attr('fill', '#374151')
        .text((d: any) => this.currencyPipe.transform(d.value, 'BRL', 'symbol', '1.0-0'));
  }

  private drawCostBySkillChart(data: { name: string, value: number }[]): void {
    const container = this.costBySkillChartContainer()?.nativeElement;
    if (!container || !data || data.length === 0) {
      d3.select(container).select('svg').remove();
      return;
    }

    const margin = { top: 20, right: 30, bottom: 80, left: 60 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    d3.select(container).select('svg').remove();
    
    const svg = d3.select(container).append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand()
      .range([0, width])
      .domain(data.map((d: any) => d.name))
      .padding(0.2);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');

    const maxValue = d3.max(data, (d: any) => d.value) || 0;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.25])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y).tickFormat(d3.format("$,.0f")));

    svg.selectAll('mybar')
      .data(data)
      .join('rect')
        .attr('x', (d: any) => x(d.name)!)
        .attr('y', (d: any) => y(d.value))
        .attr('width', x.bandwidth())
        .attr('height', (d: any) => height - y(d.value))
        .attr('fill', '#818cf8');
        
    svg.selectAll('.bar-label')
      .data(data)
      .join('text')
        .attr('class', 'bar-label')
        .attr('x', (d: any) => x(d.name)! + x.bandwidth() / 2)
        .attr('y', (d: any) => y(d.value) - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .attr('fill', '#374151')
        .text((d: any) => this.currencyPipe.transform(d.value, 'BRL', 'symbol', '1.0-0'));
  }

  private getPrimarySkillForUser(user: User, slot: TimeSlot): string | null {
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

  getTotalCapacity(slot: TimeSlot): number {
    return (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;
  }

  getGroupedActivityCounts(slot: TimeSlot): { approvedCount: number, pendingCount: number, approvedRegs: Registration[] } {
    const isGrouped = slot.job.isGrouped;
    const allRegistrations = this.jobService.registrations();
    
    const relevantRegistrations = isGrouped 
        ? allRegistrations.filter(r => r.job.id === slot.job.id)
        : allRegistrations.filter(r => r.slotId === slot.id);

    const approvedRegsAll = relevantRegistrations.filter(r => r.status === 'approved');
    const pendingRegs = relevantRegistrations.filter(r => r.status === 'pending');

    const approvedRegsMap = new Map<string, Registration>();
    for (const reg of approvedRegsAll) {
        if (!approvedRegsMap.has(reg.user.id)) {
            approvedRegsMap.set(reg.user.id, reg);
        }
    }
    const uniqueApprovedRegs = Array.from(approvedRegsMap.values());
    const pendingUserIds = new Set(pendingRegs.map(r => r.user.id));

    return { approvedCount: uniqueApprovedRegs.length, pendingCount: pendingUserIds.size, approvedRegs: uniqueApprovedRegs };
  }
  
  getApprovedUserNames(regs: Registration[]): string {
      if (regs.length === 0) return 'N/A';
      if (regs.length > 3) {
          return this.t()('financialReport.userCount', { count: regs.length });
      }
      return regs.map(r => r.user.name).join(', ');
  }

  getSkillForRegistration(reg: Registration): string | null {
    const slot = this.jobService.timeSlots().find(s => s.id === reg.slotId);
    if (!slot) return null;
    return reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
  }

  onActivityClick(slot: TimeSlot) {
    this.slotClicked.emit(slot);
  }
  
  toggleRow(key: string) {
    this.expandedRows.update(currentSet => {
      const newSet = new Set(currentSet);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  }

  printReport(): void {
    const view = this.viewMode();
    const tableId = view === 'byActivity' ? 'managerial-report-table' : 'byuser-report-table';
    const reportSection = document.getElementById(tableId);
    if (!reportSection) return;

    const printContent = reportSection.innerHTML;
    const printWindow = window.open('', '_blank');

    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Report</title>');
      printWindow.document.write(`
        <style>
          body { font-family: sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 10px; text-align: left; }
          th { background-color: #f2f2f2; }
          h2 { font-size: 1.5rem; margin-bottom: 1rem; }
        </style>
      `);
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContent);
      printWindow.document.write('</body></html>');
      
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  async shareReport(): Promise<void> {
    const t = this.t();
    const textSummary = this.viewMode() === 'byActivity' ? this.generateManagerialTextSummary() : this.generateUserTextSummary();
    const reportTitle = t('portal.admin.tabs.financialReport');

    if (navigator.share) {
      try {
        await navigator.share({ title: reportTitle, text: textSummary });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Error sharing text:', error);
          this.notificationService.showError('notifications.shareNotSupported');
        }
      }
    } 
    else if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textSummary);
        this.notificationService.show('notifications.copiedToClipboard');
      } catch (err) {
        console.error('Could not copy text: ', err);
        this.notificationService.showError('notifications.shareAndCopyNotSupported');
      }
    } 
    else {
      this.notificationService.showError('notifications.shareNotSupported');
    }
  }

  private generateManagerialTextSummary(): string {
    const rows = this.managerialReportRows();
    const totals = this.reportTotals();
    const t = this.t();
    const lang = this.translationService.currentLanguage();
    let text = `*${t('portal.admin.tabs.financialReport')} - ${t('financialReport.viewMode.byActivity')}*\n\n`;

    rows.forEach(row => {
      text += `*${row.jobTitle}* (${row.slot.job.companyName})\n`;
      text += `${this.datePipe.transform(row.startDate, 'shortDate', undefined, lang)} | ${this.getApprovedUserNames(row.approvedRegs)} | ${this.currencyPipe.transform(row.totalValue, 'BRL')}\n`;
      text += `--------------------\n`;
    });
    
    text += `*${t('report.totalsLabel')}* ${this.currencyPipe.transform(totals?.totalAmount, 'BRL')}`;
    return text;
  }
  
  private generateUserTextSummary(): string {
    const rows = this.userReportRows();
    const totals = this.reportTotals();
    const t = this.t();
    let text = `*${t('portal.admin.tabs.financialReport')} - ${t('financialReport.viewMode.byUser')}*\n\n`;

    rows.forEach(row => {
      text += `*${row.user.name}* | ${this.currencyPipe.transform(row.totalValue, 'BRL')}\n`;
    });

    text += `--------------------\n`;
    text += `*${t('report.totalsLabel')}* ${this.currencyPipe.transform(totals?.totalAmount, 'BRL')}`;
    return text;
  }


  private generateCSVContent(): string {
    const t = this.t();
    const lang = this.translationService.currentLanguage();

    if (this.viewMode() === 'byActivity') {
        const rowsData = this.managerialReportRows();
        const headers = [t('financialReport.headers.date'), t('financialReport.headers.activityCompany'), t('financialReport.headers.approvedUsers'), t('financialReport.headers.totalValue')];
        const rows = rowsData.map(row => [
            `"${this.datePipe.transform(row.startDate, 'shortDate', undefined, lang)}"`,
            `"${row.jobTitle.replace(/"/g, '""')} - ${row.slot.job.companyName.replace(/"/g, '""')}"`,
            `"${this.getApprovedUserNames(row.approvedRegs).replace(/"/g, '""')}"`,
            `"${this.currencyPipe.transform(row.totalValue, 'BRL', '', '1.2-2')}"`
        ]);
        return headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
    } else {
        const rowsData = this.userReportRows();
        const headers = [t('financialReport.headers.user'), t('financialReport.headers.totalToPay')];
        const rows = rowsData.map(row => [
            `"${row.user.name.replace(/"/g, '""')}"`,
            `"${this.currencyPipe.transform(row.totalValue, 'BRL', '', '1.2-2')}"`
        ]);
        return headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
    }
  }

  downloadCSV(): void {
    const csvContent = this.generateCSVContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `financial_report_${this.viewMode()}.csv`);
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}