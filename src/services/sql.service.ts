import { Injectable, signal } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { MOCK_COMPANIES, MOCK_REGISTRATIONS, MOCK_SKILLS, MOCK_TIMESLOTS, MOCK_USERS } from '../data/mock-data';
import { User } from '../models/user.model';
import { Company } from '../models/company.model';
import { Skill } from '../models/skill.model';
import { TimeSlot } from '../models/timeslot.model';
import { Registration } from '../models/registration.model';

/**
 * IMPORTANT: This is a simulation service.
 * In a real-world application, a frontend application NEVER connects directly to a database.
 * This service mimics how a backend server would receive a request, execute a SQL query against
 * a real database (like MySQL), and return the result. This approach demonstrates the SQL logic
 * visibly in the frontend code for educational purposes without introducing a critical security flaw.
 */
@Injectable({
  providedIn: 'root',
})
export class SqlService {
  private readonly _users = signal<User[]>([...MOCK_USERS]);
  private readonly _companies = signal<Company[]>([...MOCK_COMPANIES]);
  private readonly _skills = signal<Skill[]>([...MOCK_SKILLS]);
  private readonly _timeSlots = signal<TimeSlot[]>([...MOCK_TIMESLOTS]);
  private readonly _registrations = signal<Registration[]>([...MOCK_REGISTRATIONS]);

  public readonly users = this._users.asReadonly();
  public readonly companies = this._companies.asReadonly();
  public readonly skills = this._skills.asReadonly();
  public readonly timeSlots = this._timeSlots.asReadonly();
  public readonly registrations = this._registrations.asReadonly();

  private getTableSignal(tableName: string) {
    switch (tableName.toLowerCase()) {
      case 'users': return this._users;
      case 'companies': return this._companies;
      case 'skills': return this._skills;
      case 'timeslots': return this._timeSlots;
      case 'registrations': return this._registrations;
      default: throw new Error(`SQL Simulation Error: Table "${tableName}" not found.`);
    }
  }

  /**
   * Executes a simulated SQL query against the in-memory data.
   * @param query The SQL query string (e.g., "SELECT * FROM users WHERE id = ?").
   * @param params An array of parameters to safely bind to the query's "?" placeholders.
   * @returns An Observable with the query result.
   */
  public execute(query: string, params: any[] = []): Observable<any> {
    const upperQuery = query.trim().toUpperCase();
    
    console.log(`[SQL Service] Executing: ${query}`, params);

    try {
      if (upperQuery.startsWith('SELECT')) {
        return of(this.handleSelect(query, params));
      }
      if (upperQuery.startsWith('INSERT')) {
        return of(this.handleInsert(query, params));
      }
      if (upperQuery.startsWith('UPDATE')) {
        return of(this.handleUpdate(query, params));
      }
      if (upperQuery.startsWith('DELETE')) {
        return of(this.handleDelete(query, params));
      }
      return throwError(() => new Error(`Unsupported SQL command: ${query}`));
    } catch (e: any) {
      console.error("SQL Execution Error:", e.message);
      return throwError(() => e);
    }
  }

  private handleSelect(query: string, params: any[]): any[] {
    const fromMatch = /FROM\s+([a-zA-Z0-9_]+)/i.exec(query);
    if (!fromMatch) throw new Error('Invalid SELECT: Missing FROM clause.');
    
    const tableName = fromMatch[1];
    const tableSignal = this.getTableSignal(tableName);
    let results = [...tableSignal()]; // Work with a copy

    const whereMatch = /WHERE\s+(.+)/i.exec(query);
    if (whereMatch) {
      const conditions = whereMatch[1].split(/AND/i).map(s => s.trim());
      let paramIndex = 0;

      for (const condition of conditions) {
        const condMatch = /([a-zA-Z0-9_]+)\s*=\s*\?/.exec(condition);
        if (!condMatch) throw new Error(`Unsupported WHERE clause format: ${condition}`);
        
        const key = condMatch[1];
        const value = params[paramIndex++];
        
        results = results.filter((item: any) => item[key] === value);
      }
    }
    return results;
  }

  private handleInsert(query: string, params: any[]): void {
    const intoMatch = /INSERT INTO\s+([a-zA-Z0-9_]+)\s+\(([^)]+)\)/i.exec(query);
    if (!intoMatch) throw new Error('Invalid INSERT statement format.');
    
    const tableName = intoMatch[1];
    const columns = intoMatch[2].split(',').map(s => s.trim());
    
    if (columns.length !== params.length) throw new Error('Column count does not match parameter count.');
    
    const newRecord: any = {};
    columns.forEach((col, index) => {
      newRecord[col] = params[index];
    });

    const tableSignal = this.getTableSignal(tableName);
    tableSignal.update((currentData: any) => [...currentData, newRecord].sort(this.getSortFunction(tableName)));
  }

  private handleUpdate(query: string, params: any[]): void {
    const updateMatch = /UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)/i.exec(query);
    if (!updateMatch) throw new Error('Invalid UPDATE statement format.');
    
    const tableName = updateMatch[1];
    const setClause = updateMatch[2];
    const whereClause = updateMatch[3];

    const setParts = setClause.split(',').map(s => s.trim());
    const updates: Record<string, any> = {};
    let paramIndex = 0;
    setParts.forEach(part => {
      const [key] = part.split('=').map(s => s.trim());
      updates[key] = params[paramIndex++];
    });
    
    const whereCondMatch = /([a-zA-Z0-9_]+)\s*=\s*\?/.exec(whereClause);
    if (!whereCondMatch) throw new Error(`Unsupported WHERE clause: ${whereClause}`);
    
    const whereKey = whereCondMatch[1];
    const whereValue = params[paramIndex];
    
    const tableSignal = this.getTableSignal(tableName);
    tableSignal.update((currentData: any[]) => 
      currentData.map(item => item[whereKey] === whereValue ? { ...item, ...updates } : item)
    );
  }

  private handleDelete(query: string, params: any[]): void {
    const deleteMatch = /DELETE FROM\s+([a-zA-Z0-9_]+)\s+WHERE\s+(.+)/i.exec(query);
    if (!deleteMatch) throw new Error('Invalid DELETE statement format.');
    
    const tableName = deleteMatch[1];
    const whereClause = deleteMatch[2];
    
    const whereCondMatch = /([a-zA-Z0-9_]+)\s*=\s*\?/.exec(whereClause);
    if (!whereCondMatch) throw new Error(`Unsupported WHERE clause: ${whereClause}`);
    
    const whereKey = whereCondMatch[1];
    const whereValue = params[0];

    const tableSignal = this.getTableSignal(tableName);
    tableSignal.update((currentData: any[]) => currentData.filter(item => item[whereKey] !== whereValue));
  }

  private getSortFunction(tableName: string): (a: any, b: any) => number {
    switch (tableName.toLowerCase()) {
        case 'companies':
        case 'skills':
            return (a, b) => a.name.localeCompare(b.name);
        case 'timeslots':
            return (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        default:
            return () => 0;
    }
  }
}