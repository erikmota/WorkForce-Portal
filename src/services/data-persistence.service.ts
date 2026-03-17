import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { User } from '../models/user.model';
import { Company } from '../models/company.model';
import { Skill } from '../models/skill.model';
import { TimeSlot } from '../models/timeslot.model';
import { Registration } from '../models/registration.model';
import { MOCK_USERS, MOCK_COMPANIES, MOCK_SKILLS, MOCK_TIMESLOTS, MOCK_REGISTRATIONS, MOCK_AUDIT_LOGS } from '../data/mock-data';
import { AuditLog } from '../models/audit-log.model';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class DataPersistenceService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  // Signals to hold the application state
  public readonly _users = signal<User[]>([]);
  public readonly _companies = signal<Company[]>([]);
  public readonly _skills = signal<Skill[]>([]);
  public readonly _timeSlots = signal<TimeSlot[]>([]);
  public readonly _registrations = signal<Registration[]>([]);
  public readonly _auditLogs = signal<AuditLog[]>([]);
  private readonly _isOffline = signal<boolean>(false);

  // Public readonly signals for components and other services to consume
  public readonly users = this._users.asReadonly();
  public readonly companies = this._companies.asReadonly();
  public readonly skills = this._skills.asReadonly();
  public readonly timeSlots = this._timeSlots.asReadonly();
  public readonly registrations = this._registrations.asReadonly();
  public readonly auditLogs = this._auditLogs.asReadonly();
  public readonly isOffline = this._isOffline.asReadonly();

  constructor() {
    // Data loading is now handled by the APP_INITIALIZER via loadInitialData()
  }

  public loadInitialData(): Observable<any> {
    const users$ = this.http.get<User[]>(`${this.apiUrl}/users`).pipe(
        catchError(() => {
            console.warn('API for users failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_USERS]);
        })
    );

    const companies$ = this.http.get<Company[]>(`${this.apiUrl}/companies`).pipe(
        catchError(() => {
            console.warn('API for companies failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_COMPANIES]);
        })
    );

    const skills$ = this.http.get<Skill[]>(`${this.apiUrl}/skills`).pipe(
        catchError(() => {
            console.warn('API for skills failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_SKILLS]);
        })
    );

    const timeSlots$ = this.http.get<TimeSlot[]>(`${this.apiUrl}/timeslots`).pipe(
        catchError(() => {
            console.warn('API for timeslots failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_TIMESLOTS]);
        })
    );
    
    const registrations$ = this.http.get<Registration[]>(`${this.apiUrl}/registrations`).pipe(
        catchError(() => {
            console.warn('API for registrations failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_REGISTRATIONS]);
        })
    );
    
    const auditLogs$ = this.http.get<AuditLog[]>(`${this.apiUrl}/audit-logs`).pipe(
        catchError(() => {
            console.warn('API for audit logs failed, falling back to mock data.');
            this.setOfflineMode(true);
            return of([...MOCK_AUDIT_LOGS]);
        })
    );

    return forkJoin({
        users: users$,
        companies: companies$,
        skills: skills$,
        timeSlots: timeSlots$,
        registrations: registrations$,
        auditLogs: auditLogs$
    }).pipe(
        tap(data => {
            this._users.set(data.users);
            this._companies.set(data.companies);
            this._skills.set(data.skills);
            
            // Revive date objects from JSON payload or mock data
            const mappedSlots = data.timeSlots.map((s: any) => ({ ...s, startTime: new Date(s.startTime), endTime: new Date(s.endTime) }));
            this._timeSlots.set(mappedSlots);

            const mappedRegs = data.registrations.map((r: any) => ({ ...r, startTime: new Date(r.startTime), endTime: new Date(r.endTime) }));
            this._registrations.set(mappedRegs);

            const mappedLogs = data.auditLogs.map((l: any) => ({...l, timestamp: new Date(l.timestamp) }));
            this._auditLogs.set(mappedLogs);

            console.log('Initial data loaded successfully.');
        })
    );
  }

  public setOfflineMode(isOffline: boolean): void {
    if (this._isOffline() !== isOffline) {
        this._isOffline.set(isOffline);
    }
  }
}