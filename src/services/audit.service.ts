import { Injectable, inject } from '@angular/core';
import { DataPersistenceService } from './data-persistence.service';
import { AuditLog } from '../models/audit-log.model';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuditService {
  private dataPersistence = inject(DataPersistenceService);

  public readonly auditLogs = this.dataPersistence.auditLogs;

  logChange(
    targetUser: User,
    fieldName: string,
    oldValue: any,
    newValue: any,
    changedByUser: User | null
  ) {
    if (!changedByUser) {
      return;
    }

    // Don't log if there's no actual change
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return;
    }

    const logEntry: AuditLog = {
      id: uuidv4(),
      userId: targetUser.id,
      userName: targetUser.name,
      timestamp: new Date(),
      fieldName,
      oldValue: this.stringifyValue(oldValue),
      newValue: this.stringifyValue(newValue),
      changedBy: changedByUser.id,
      changedByName: changedByUser.name,
    };

    this.dataPersistence._auditLogs.update(logs => [...logs, logEntry]);
  }

  private stringifyValue(value: any): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(
        ([, val]) => val !== null && val !== undefined && val !== ''
      );
      if (entries.length === 0) {
        return 'N/A';
      }
      return entries.map(([key, val]) => `${key}: ${val}`).join('; ');
    }
    return String(value) || 'N/A';
  }
}
