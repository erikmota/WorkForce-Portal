import { Component, ChangeDetectionStrategy, computed, inject, input, output, effect, viewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
  selector: 'app-general-report',
  imports: [CommonModule],
  templateUrl: './general-report.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe]
})
export class GeneralReportComponent implements AfterViewInit, OnDestroy {
  jobService = inject(JobService);
  authService = inject(AuthService);
  translationService = inject(TranslationService);
  notificationService = inject(NotificationService);
  datePipe = inject(DatePipe);
  t = this.translationService.t;

  slotClicked = output<TimeSlot>();

  // Chart containers
  private companyChartContainer = viewChild<ElementRef>('companyChart');
  private skillChartContainer = viewChild<ElementRef>('skillChart');
  private resizeObserver!: ResizeObserver;

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

  filteredSlots = computed<TimeSlot[]>(() => {
    const user = this.currentUser();
    if (!user) return [];
    
    let allSlots = this.jobService.timeSlots();
    const userId = this.userIdFilter();

    // Admin user filter
    if (userId !== 'all' && userId) {
      const userRegistrationSlotIds = new Set(
          this.jobService.registrations()
              .filter(r => r.user.id === userId)
              .map(r => r.slotId)
      );
      allSlots = allSlots.filter(slot => userRegistrationSlotIds.has(slot.id));
    }

    // Role filter
    if (!user.isGlobalAdmin) {
       allSlots = allSlots.filter(slot => {
        const roleForCompany = user.rolesByCompany?.[slot.job.companyId];
        return roleForCompany === 'company-admin';
      });
    }

    // Apply user-facing filters
    const title = this.titleFilter().toLowerCase();
    const companyId = this.companyIdFilter();
    const isGrouped = this.isGroupedFilter();
    const transportFilter = this.needsTransportationFilter();
    const skill = this.skillFilter();
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

        const skillMatch = skill !== 'all' ? (slot.requiredSkills ?? []).includes(skill) : true;

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
        
        return titleMatch && companyIdMatch && groupedMatch && transportMatch && skillMatch && dateMatch && statusMatch;
    }).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  });

  public reportRows = computed(() => {
    const slots = this.filteredSlots();
    const grouped = new Map<string, TimeSlot[]>();
    const singles: TimeSlot[] = [];

    // Separate single slots from grouped slots
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

    // Process single slots
    const singleRows = singles.map(slot => {
      const { approvedCount } = this.getGroupedActivityCounts(slot);
      return {
        isGroup: false,
        jobTitle: slot.job.title,
        skills: slot.requiredSkills?.join(', ') || 'N/A',
        startDate: slot.startTime,
        endDate: slot.startTime, // Start and end date are the same
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacityText: this.getCapacityText(slot),
        approvedUserNames: this.getApprovedUserNames(slot),
        approvedUsersCount: approvedCount,
        statusText: this.getStatusText(slot),
        key: slot.id, // Unique key for tracking
        slot: slot,
      };
    });

    // Process grouped slots
    const groupedRows = Array.from(grouped.values()).map(groupSlots => {
      groupSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      const firstSlot = groupSlots[0];
      const lastSlot = groupSlots[groupSlots.length - 1];
      const { approvedCount } = this.getGroupedActivityCounts(firstSlot);
      
      return {
        isGroup: true,
        jobTitle: firstSlot.job.title,
        skills: firstSlot.requiredSkills?.join(', ') || 'N/A',
        startDate: firstSlot.startTime,
        endDate: lastSlot.startTime, // Use start time of last slot for the date range
        startTime: firstSlot.startTime, // Time is consistent
        endTime: firstSlot.endTime,
        capacityText: this.getCapacityText(firstSlot),
        approvedUserNames: this.getApprovedUserNames(firstSlot),
        approvedUsersCount: approvedCount,
        statusText: this.getStatusText(firstSlot),
        key: firstSlot.job.id, // Unique key for tracking
        slot: firstSlot,
      };
    });

    const allRows = [...singleRows, ...groupedRows];
    allRows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    
    return allRows;
  });

  public reportTotals = computed(() => {
    const rows = this.reportRows();
    const allSlots = this.jobService.timeSlots();

    let totalCapacity = 0;
    let totalFilled = 0;
    const statusCounts = {
        available: 0,
        booked: 0,
        pending: 0,
    };
    
    // Using a Set ensures we don't double-count if the filter somehow produces duplicate representations
    const processedKeys = new Set<string>();

    for (const row of rows) {
      if (processedKeys.has(row.key)) continue;
      processedKeys.add(row.key);

      // Find a representative slot to get original data
      const representativeSlot = allSlots.find(s => row.isGroup ? s.job.id === row.key : s.id === row.key);

      if (representativeSlot) {
        const { approvedCount } = this.getGroupedActivityCounts(representativeSlot);
        const capacity = this.getTotalCapacity(representativeSlot);

        totalCapacity += capacity;
        totalFilled += approvedCount;

        const statusText = row.statusText; // Use the already computed status text
        const t = this.t();

        if (statusText === t('report.status.available')) {
            statusCounts.available++;
        } else if (statusText === t('report.status.booked')) {
            statusCounts.booked++;
        } else if (statusText === t('report.status.pending')) {
            statusCounts.pending++;
        }
      }
    }
    
    return { totalCapacity, totalFilled, statusCounts };
  });

  public reportStats = computed(() => {
    const totals = this.reportTotals();
    const fillRate = totals.totalCapacity > 0
      ? ((totals.totalFilled / totals.totalCapacity) * 100).toFixed(0)
      : 0;

    return {
      totalActivities: this.reportRows().length,
      totalCapacity: totals.totalCapacity,
      totalApproved: totals.totalFilled,
      fillRate: fillRate,
    };
  });

  public activitiesByCompanyChartData = computed(() => {
    const data = new Map<string, number>();
    for (const row of this.reportRows()) {
      const companyName = row.slot.job.companyName;
      data.set(companyName, (data.get(companyName) || 0) + 1);
    }
    return Array.from(data, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });
  
  public skillUtilizationChartData = computed(() => {
    const data = new Map<string, { skill: string, capacity: number, approved: number }>();
    const processedJobs = new Set<string>();

    for (const slot of this.filteredSlots()) {
      if (slot.capacityMode !== 'skill' || !slot.capacityBySkill) continue;
      
      const key = slot.job.isGrouped ? slot.job.id : slot.id;
      if (processedJobs.has(key)) continue;
      processedJobs.add(key);

      const { approvedRegs } = this.getGroupedActivityCounts(slot);
      const skillTallies: Record<string, number> = {};
      for (const reg of approvedRegs) {
        const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
        if (skillUsed) {
          skillTallies[skillUsed] = (skillTallies[skillUsed] || 0) + 1;
        }
      }
      
      for(const skill in slot.capacityBySkill) {
        if (!data.has(skill)) {
          data.set(skill, { skill, capacity: 0, approved: 0 });
        }
        const skillData = data.get(skill)!;
        skillData.capacity += slot.capacityBySkill[skill];
        skillData.approved += skillTallies[skill] || 0;
      }
    }
    return Array.from(data.values());
  });

  constructor() {
    effect(() => {
      this.drawCompanyChart(this.activitiesByCompanyChartData());
      this.drawSkillChart(this.skillUtilizationChartData());
    });
  }

  ngAfterViewInit(): void {
    const container = document.querySelector('.px-4.sm\\:px-0');
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.drawCompanyChart(this.activitiesByCompanyChartData());
        this.drawSkillChart(this.skillUtilizationChartData());
      });
      this.resizeObserver.observe(container);
    }
  }

  ngOnDestroy(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }

  private drawCompanyChart(data: { name: string, value: number }[]): void {
    const container = this.companyChartContainer()?.nativeElement;
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
      .call(d3.axisBottom(x));

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
        .text((d: any) => d.value > 0 ? d.value : '');
  }

  private drawSkillChart(data: { skill: string, capacity: number, approved: number }[]): void {
    const container = this.skillChartContainer()?.nativeElement;
     if (!container || !data || data.length === 0) {
      d3.select(container).select('svg').remove();
      return;
    }

    const margin = { top: 30, right: 30, bottom: 80, left: 40 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = container.clientHeight - margin.top - margin.bottom;

    d3.select(container).select('svg').remove();
    
    const svg = d3.select(container).append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
      .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const subgroups = ['capacity', 'approved'];
    const groups = data.map((d: any) => d.skill);

    const x = d3.scaleBand()
        .domain(groups)
        .range([0, width])
        .padding([0.2]);
        
    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
        .attr('transform', 'translate(-10,0)rotate(-45)')
        .style('text-anchor', 'end');

    const maxValue = d3.max(data, (d: any) => Math.max(d.capacity, d.approved)) || 0;
    const y = d3.scaleLinear()
      .domain([0, maxValue * 1.25])
      .range([height, 0]);

    svg.append('g')
      .call(d3.axisLeft(y));

    const xSubgroup = d3.scaleBand()
      .domain(subgroups)
      .range([0, x.bandwidth()])
      .padding([0.05]);

    const color = d3.scaleOrdinal()
      .domain(subgroups)
      .range(['#a5b4fc', '#4f46e5']);

    const barGroups = svg.append('g')
      .selectAll('g')
      .data(data)
      .join('g')
        .attr('transform', (d: any) => `translate(${x(d.skill)}, 0)`);

    barGroups.selectAll('rect')
      .data((d: any) => subgroups.map(key => ({ key: key, value: d[key] })))
      .join('rect')
        .attr('x', (d: any) => xSubgroup(d.key)!)
        .attr('y', (d: any) => y(d.value))
        .attr('width', xSubgroup.bandwidth())
        .attr('height', (d: any) => height - y(d.value))
        .attr('fill', (d: any) => color(d.key) as string);

    barGroups.selectAll('.bar-label')
        .data((d: any) => subgroups.map(key => ({ key, value: d[key] })))
        .join('text')
          .attr('class', 'bar-label')
          .attr('x', (d: any) => xSubgroup(d.key)! + xSubgroup.bandwidth() / 2)
          .attr('y', (d: any) => y(d.value) - 5)
          .attr('text-anchor', 'middle')
          .style('font-size', '10px')
          .attr('fill', '#374151')
          .text((d: any) => d.value > 0 ? d.value : '');
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

  getCapacityText(slot: TimeSlot): string {
    const { approvedRegs, approvedCount } = this.getGroupedActivityCounts(slot);

    if (slot.capacityMode === 'skill' && slot.capacityBySkill && slot.requiredSkills && slot.requiredSkills.length > 0) {
      const skillTallies: Record<string, number> = {};
      
      for (const reg of approvedRegs) {
        const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
        if (skillUsed && slot.requiredSkills.includes(skillUsed)) {
            skillTallies[skillUsed] = (skillTallies[skillUsed] || 0) + 1;
        }
      }

      return slot.requiredSkills
        .map(skill => {
          const approved = skillTallies[skill] || 0;
          const capacity = slot.capacityBySkill![skill] || 0;
          return `${skill}: ${approved}/${capacity}`;
        })
        .join('; ');
    }
    
    const totalCapacity = this.getTotalCapacity(slot);
    return `${approvedCount}/${totalCapacity}`;
  }
  
  getApprovedUserNames(slot: TimeSlot): string {
      const { approvedRegs } = this.getGroupedActivityCounts(slot);
      if (approvedRegs.length === 0) return 'N/A';
      return approvedRegs.map(r => r.user.name).join(', ');
  }

  getStatusText(slot: TimeSlot): string {
      const { approvedCount, pendingCount } = this.getGroupedActivityCounts(slot);
      const totalCapacity = this.getTotalCapacity(slot);
      const t = this.t();
      
      if (approvedCount >= totalCapacity) return t('report.status.booked');
      if (pendingCount > 0) return t('report.status.pending');
      return t('report.status.available');
  }

  onActivityClick(slot: TimeSlot) {
    this.slotClicked.emit(slot);
  }

  printReport(): void {
    const reportSection = document.getElementById('report-section');
    if (!reportSection) return;

    const printContent = reportSection.innerHTML;
    const printWindow = window.open('', '_blank');

    if (printWindow) {
      printWindow.document.write('<html><head><title>Print Report</title>');
      printWindow.document.write(`
        <style>
          body { font-family: sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; text-align: left; }
          th { background-color: #f2f2f2; }
          h2 { font-size: 1.5rem; margin-bottom: 1rem; }
          /* This mimics Tailwind's print:hidden utility */
          .print\\:hidden { display: none; }
        </style>
      `);
      printWindow.document.write('</head><body>');
      printWindow.document.write(printContent);
      printWindow.document.write('</body></html>');
      
      printWindow.document.close();
      printWindow.focus();
      
      // Give the browser a moment to render the content before printing
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }

  async shareReport(): Promise<void> {
    const t = this.t();
    const textSummary = this.generateTextSummaryForShare();
    const reportTitle = t('report.shareTitle');

    // If Web Share API is available, use it for text.
    if (navigator.share) {
      try {
        await navigator.share({ title: reportTitle, text: textSummary });
      } catch (error) {
        // We only want to show an error if it's not the user cancelling the share.
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          console.error('Error sharing text:', error);
          this.notificationService.showError('notifications.shareNotSupported');
        }
      }
    } 
    // Fallback for browsers that don't support Web Share API (most desktops)
    else if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(textSummary);
        this.notificationService.show('notifications.copiedToClipboard');
      } catch (err) {
        console.error('Could not copy text: ', err);
        this.notificationService.showError('notifications.shareAndCopyNotSupported');
      }
    } 
    // Final fallback if neither API is available
    else {
      this.notificationService.showError('notifications.shareNotSupported');
    }
  }

  private generateTextSummaryForShare(): string {
    const rows = this.reportRows();
    const t = this.t();
    const reportTitle = `*${t('report.shareTitle')}*`;
    const lang = this.translationService.currentLanguage();

    let text = `${reportTitle}\n\n${t('report.shareSummary', { count: rows.length })}\n\n`;
    
    rows.forEach(row => {
      text += `*${t('report.headers.activity')}:* ${row.jobTitle}\n`;
      text += `*${t('report.headers.startDate')}:* ${this.datePipe.transform(row.startDate, 'shortDate', undefined, lang)}\n`;
      text += `*${t('report.headers.endDate')}:* ${this.datePipe.transform(row.endDate, 'shortDate', undefined, lang)}\n`;
      text += `*${t('report.headers.time')}:* ${this.datePipe.transform(row.startTime, 'shortTime', undefined, lang)} - ${this.datePipe.transform(row.endTime, 'shortTime', undefined, lang)}\n`;
      text += `*${t('report.headers.skills')}:* ${row.skills}\n`;
      text += `*${t('report.headers.capacity')}:* ${row.capacityText}\n`;
      text += `*${t('report.headers.registeredUsers')}:* ${row.approvedUsersCount}\n`;
      text += `*${t('report.headers.status')}:* ${row.statusText}\n`;
      text += `--------------------\n\n`;
    });
    
    return text;
  }

  private generateCSVContent(): string {
    const rowsData = this.reportRows();
    const t = this.t();
    const lang = this.translationService.currentLanguage();

    const headers = [
      t('report.headers.startDate'),
      t('report.headers.endDate'),
      t('report.headers.time'),
      t('report.headers.activity'),
      t('report.headers.skills'),
      t('report.headers.capacity'),
      t('report.headers.registeredUsers'),
      t('report.headers.status'),
    ];

    const rows = rowsData.map(row => {
      return [
        `"${this.datePipe.transform(row.startDate, 'shortDate', undefined, lang)}"`,
        `"${this.datePipe.transform(row.endDate, 'shortDate', undefined, lang)}"`,
        `${this.datePipe.transform(row.startTime, 'HH:mm')} - ${this.datePipe.transform(row.endTime, 'HH:mm')}`,
        `"${row.jobTitle.replace(/"/g, '""')}"`,
        `"${row.skills.replace(/"/g, '""')}"`,
        `"${row.capacityText.replace(/"/g, '""')}"`,
        `"${row.approvedUsersCount}"`,
        row.statusText,
      ];
    });

    return headers.join(',') + '\n' + rows.map(e => e.join(',')).join('\n');
  }

  downloadCSV(): void {
    const csvContent = this.generateCSVContent();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "workforce_report.csv");
    document.body.appendChild(link);

    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}