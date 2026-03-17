import { Component, ChangeDetectionStrategy, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth.service';
import { TranslationService } from '../../../services/translation.service';
import { AuditService } from '../../../services/audit.service';
import { AuditLog } from '../../../models/audit-log.model';

@Component({
  selector: 'app-audit-log',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './audit-log.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogComponent {
  public authService = inject(AuthService);
  public auditService = inject(AuditService);
  public translationService = inject(TranslationService);
  public t = this.translationService.t;

  public startDate = input<string>('');
  public endDate = input<string>('');
  public userId = input<string>('all');

  public visibleUsers = this.authService.endUsers;

  public filteredLogs = computed<AuditLog[]>(() => {
    let logs = this.auditService.auditLogs();
    
    const userIdFilter = this.userId();
    const start = this.startDate();
    const end = this.endDate();
    const startTime = start ? new Date(start + 'T00:00:00').getTime() : 0;
    const endTime = end ? new Date(end + 'T23:59:59').getTime() : Infinity;

    logs = logs.filter(log => {
      const userMatch = userIdFilter === 'all' || log.userId === userIdFilter;
      const dateMatch = (!start && !end) ? true : (log.timestamp.getTime() >= startTime && log.timestamp.getTime() <= endTime);
      return userMatch && dateMatch;
    });

    return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  });
}
