import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of, tap, map, catchError, forkJoin } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { TimeSlot } from '../models/timeslot.model';
import { Job } from '../models/job.model';
import { User } from '../models/user.model';
import { Registration } from '../models/registration.model';
import { Company } from '../models/company.model';
import { Skill } from '../models/skill.model';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { environment } from '../environments/environment';
import { DataPersistenceService } from './data-persistence.service';
import { TranslationService } from './translation.service';

@Injectable({
  providedIn: 'root',
})
export class JobService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private notificationService = inject(NotificationService);
  private translationService = inject(TranslationService);
  private dataPersistence = inject(DataPersistenceService);
  private apiUrl = environment.apiUrl;

  // State is now managed by DataPersistenceService
  public readonly timeSlots = this.dataPersistence.timeSlots;
  public readonly registrations = this.dataPersistence.registrations;
  public readonly companies = this.dataPersistence.companies;
  public readonly skills = this.dataPersistence.skills;
  
  // Computed Signals derive from the centralized state
  public readonly pendingRegistrations = computed(() => 
    this.registrations()
      .filter(r => r.status === 'pending')
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  );

  public readonly approvedRegistrations = computed(() =>
    this.registrations()
      .filter(r => r.status === 'approved')
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  );

  public readonly notSelectedRegistrations = computed(() =>
    this.registrations()
      .filter(r => r.status === 'not-selected')
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
  );

  // --- Data Loading ---
  loadAllData(): Observable<[void, void, void, void]> {
    // Data is loaded in DataPersistenceService constructor.
    // This method is kept for the initial loading sequence in portal.component.
    return of([undefined, undefined, undefined, undefined]);
  }

  private loadTimeSlots(): Observable<void> { return of(undefined); }
  private loadRegistrations(): Observable<void> { return of(undefined); }
  private loadCompanies(): Observable<void> { return of(undefined); }
  private loadSkills(): Observable<void> { return of(undefined); }
  
  // --- TimeSlots ---
  addSlot(slotData: any): Observable<TimeSlot> {
    return this.http.post<TimeSlot>(`${this.apiUrl}/timeslots`, slotData).pipe(
      // FIX: Explicitly type `newSlot` to resolve type inference issues.
      tap((newSlot: TimeSlot) => {
        this.dataPersistence.setOfflineMode(false);
        const mappedSlot = { ...newSlot, startTime: new Date(newSlot.startTime), endTime: new Date(newSlot.endTime) };
        this.dataPersistence._timeSlots.update(slots => [...slots, mappedSlot]);
        this.notifyUsersOfAvailableSlot(mappedSlot);
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn('API for addSlot failed, operating on local session data.', err);
        const newSlot: TimeSlot = {
            ...slotData,
            id: uuidv4(),
            job: {
                ...slotData.job,
                id: slotData.job.id || uuidv4(),
                companyName: this.companies().find(c => c.id === slotData.job.companyId)?.name || 'Unknown Company'
            },
            startTime: new Date(slotData.startTime),
            endTime: new Date(slotData.endTime)
        };
        this.dataPersistence._timeSlots.update(slots => [...slots, newSlot]);
        this.notifyUsersOfAvailableSlot(newSlot);
        return of(newSlot);
      })
    );
  }

  updateSlot(slotId: string, slotData: any): Observable<TimeSlot> {
    return this.http.put<TimeSlot>(`${this.apiUrl}/timeslots/${slotId}`, slotData).pipe(
      // FIX: Explicitly type `updatedSlot` to resolve type inference issues.
      tap((updatedSlot: TimeSlot) => {
        this.dataPersistence.setOfflineMode(false);
        const mappedSlot = { ...updatedSlot, startTime: new Date(updatedSlot.startTime), endTime: new Date(updatedSlot.endTime) };
        this.dataPersistence._timeSlots.update(slots => slots.map(s => s.id === slotId ? mappedSlot : s));
        this.notifyUsersOfAvailableSlot(mappedSlot);
      }),
       catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for updateSlot (${slotId}) failed, operating on local session data.`, err);
        const companyName = this.companies().find(c => c.id === slotData.job.companyId)?.name || 'Unknown Company';
        const updatedSlot: TimeSlot = {
            id: slotId,
            ...slotData,
            job: { ...slotData.job, companyName },
            startTime: new Date(slotData.startTime),
            endTime: new Date(slotData.endTime)
        };
        this.dataPersistence._timeSlots.update(slots => slots.map(s => s.id === slotId ? updatedSlot : s));
        this.notifyUsersOfAvailableSlot(updatedSlot);
        return of(updatedSlot);
      })
    );
  }

  deleteSlot(slotId: string): Observable<void> {
    const hasApprovedRegistrations = this.registrations().some(r => r.slotId === slotId && r.status === 'approved');
    if (hasApprovedRegistrations) {
      this.notificationService.showError('notifications.activityDeleteInUse');
      return throwError(() => new Error('Cannot delete activity with approved users.'));
    }

    return this.http.delete<void>(`${this.apiUrl}/timeslots/${slotId}`).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        this.dataPersistence._timeSlots.update(slots => slots.filter(s => s.id !== slotId));
        this.dataPersistence._registrations.update(regs => regs.filter(r => r.slotId !== slotId));
        this.notificationService.show('notifications.activityDeleted');
      }),
      catchError(err => {
          this.dataPersistence.setOfflineMode(true);
          console.warn(`API for deleteSlot (${slotId}) failed, operating on local session data.`, err);
          this.dataPersistence._timeSlots.update(slots => slots.filter(s => s.id !== slotId));
          this.dataPersistence._registrations.update(regs => regs.filter(r => r.slotId !== slotId));
          this.notificationService.show('notifications.activityDeleted');
          return of(undefined);
      })
    );
  }

  // --- Registrations ---
  requestSlot(slotId: string, user: User, transportData: { needsTransportation: boolean; transportationNotes: string; }, selectedSkill?: string): Observable<Registration> {
    const requestBody = { slotId, userId: user.id, ...transportData, selectedSkill };
    return this.http.post<Registration>(`${this.apiUrl}/registrations`, requestBody).pipe(
      tap((newReg: Registration) => {
        this.dataPersistence.setOfflineMode(false);
        const mappedReg = { ...newReg, startTime: new Date(newReg.startTime), endTime: new Date(newReg.endTime) };
        this.dataPersistence._registrations.update(regs => [...regs, mappedReg]);
        this.notificationService.show('notifications.requestSuccess');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn('API for requestSlot failed, operating on local session data.', err);
        const slot = this.timeSlots().find(s => s.id === slotId);
        if (!slot) {
          this.notificationService.showError('notifications.slotNotFound');
          return throwError(() => new Error('Slot not found'));
        }
        if (new Date(slot.startTime).getTime() < new Date().getTime()) {
          this.notificationService.showError('notifications.slotInPast');
          return throwError(() => new Error('Cannot register for a past slot.'));
        }

        if (slot.job.isGrouped) {
          const groupSlots = this.timeSlots().filter(s => s.job.id === slot.job.id);
          const newRegs: Registration[] = groupSlots.map(s => ({
            id: uuidv4(),
            slotId: s.id,
            job: s.job,
            startTime: s.startTime,
            endTime: s.endTime,
            user,
            status: 'pending',
            needsTransportation: transportData.needsTransportation,
            transportationNotes: transportData.transportationNotes,
            registeredWithSkill: selectedSkill
          }));
          this.dataPersistence._registrations.update(regs => [...regs, ...newRegs]);
          this.notificationService.show('notifications.requestSuccess');
          return of(newRegs[0]);
        } else {
          const newReg: Registration = {
              id: uuidv4(),
              slotId,
              job: slot.job,
              startTime: slot.startTime,
              endTime: slot.endTime,
              user,
              status: 'pending',
              needsTransportation: transportData.needsTransportation,
              transportationNotes: transportData.transportationNotes,
              registeredWithSkill: selectedSkill
          };
          this.dataPersistence._registrations.update(regs => [...regs, newReg]);
          this.notificationService.show('notifications.requestSuccess');
          return of(newReg);
        }
      })
    );
  }

  cancelSlotRequest(registrationId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/registrations/${registrationId}`).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        this.dataPersistence._registrations.update(regs => regs.filter(r => r.id !== registrationId));
        this.notificationService.show('notifications.requestCancelled');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for cancelSlotRequest (${registrationId}) failed, operating on local session data.`, err);
        const regToCancel = this.registrations().find(r => r.id === registrationId);
        if (regToCancel?.job.isGrouped) {
          const userId = regToCancel.user.id;
          const jobId = regToCancel.job.id;
          this.dataPersistence._registrations.update(regs => regs.filter(r => !(r.user.id === userId && r.job.id === jobId)));
        } else {
          this.dataPersistence._registrations.update(regs => regs.filter(r => r.id !== registrationId));
        }
        this.notificationService.show('notifications.requestCancelled');
        return of(undefined);
      })
    );
  }

  approveSlotRequest(registrationId: string, comment: string, selectedSkill?: string): Observable<Registration> {
    const t = this.translationService.t();

    // --- START OF VALIDATION LOGIC ---
    const regToApprove = this.registrations().find(r => r.id === registrationId);
    if (!regToApprove) {
      this.notificationService.showError('notifications.slotNotFound'); // Using a more generic error
      return throwError(() => new Error('Registration not found'));
    }

    if (regToApprove.status === 'approved') {
        this.notificationService.showError('notifications.approvalFailedAlreadyApproved');
        return throwError(() => new Error('User is already approved.'));
    }

    const slot = this.timeSlots().find(s => s.id === regToApprove.slotId);
    if (!slot) {
      this.notificationService.showError('notifications.slotNotFound');
      return throwError(() => new Error('Slot not found'));
    }
    
    if (new Date(slot.startTime).getTime() < new Date().getTime()) {
      this.notificationService.showError('notifications.approvalFailedInPast');
      return throwError(() => new Error('Cannot approve registration for a past activity.'));
    }

    const allRegistrations = this.registrations();
    const isGrouped = slot.job.isGrouped;
    
    // Get all approved registrations for this activity/group, ensuring unique users for groups
    const approvedRegsForActivity = allRegistrations.filter(r => 
        r.status === 'approved' && (isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
    );

    const approvedUsers = new Map<string, Registration>();
    for (const reg of approvedRegsForActivity) {
      if (!approvedUsers.has(reg.user.id)) {
        approvedUsers.set(reg.user.id, reg);
      }
    }
    // Also check if the user we are trying to approve is already in the list from another registration for the same group
    if (approvedUsers.has(regToApprove.user.id)) {
      this.notificationService.showError('notifications.approvalFailedAlreadyApproved');
      return throwError(() => new Error('User is already approved for this grouped activity.'));
    }

    const uniqueApprovedRegs = Array.from(approvedUsers.values());

    // Check overall capacity
    const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;

    if (uniqueApprovedRegs.length >= totalCapacity) {
      this.notificationService.showError('notifications.approvalFailedCapacity');
      return throwError(() => new Error('Activity is at full capacity.'));
    }

    // Check skill-specific capacity
    if (slot.capacityMode === 'skill' && slot.capacityBySkill) {
      const skillForUser = selectedSkill || regToApprove.registeredWithSkill || this.getPrimarySkillForUser(regToApprove.user, slot);
      
      if (skillForUser && slot.capacityBySkill[skillForUser] !== undefined) {
        const approvedForSkill = uniqueApprovedRegs.filter(reg => {
          const skillUsed = reg.registeredWithSkill || this.getPrimarySkillForUser(reg.user, slot);
          return skillUsed === skillForUser;
        }).length;
        
        if (approvedForSkill >= slot.capacityBySkill[skillForUser]) {
          this.notificationService.showError('notifications.approvalFailedSkillCapacity', 3000, { skill: skillForUser });
          return throwError(() => new Error(`Capacity for skill '${skillForUser}' is full.`));
        }
      }
    }
    // --- END OF VALIDATION LOGIC ---

    return this.http.put<Registration>(`${this.apiUrl}/registrations/${registrationId}/approve`, { comment, selectedSkill }).pipe(
      tap((approvedReg: Registration) => {
        this.dataPersistence.setOfflineMode(false);
        const mappedReg = { ...approvedReg, startTime: new Date(approvedReg.startTime), endTime: new Date(approvedReg.endTime) };
        
        if (mappedReg.job.isGrouped) {
            const userId = mappedReg.user.id;
            const jobId = mappedReg.job.id;
            this.dataPersistence._registrations.update(regs => regs.map(r => {
                if (r.user.id === userId && r.job.id === jobId) {
                    return { ...r, status: 'approved', comment, registeredWithSkill: selectedSkill || r.registeredWithSkill };
                }
                return r;
            }));
        } else {
            this.dataPersistence._registrations.update(regs => regs.map(r => {
                if (r.id === registrationId) {
                    return { ...mappedReg, status: 'approved', comment, registeredWithSkill: selectedSkill || mappedReg.registeredWithSkill };
                }
                return r;
            }));
        }
        
        this.notificationService.show('notifications.registrationApproved');
        const displayTitle = mappedReg.job.hideTitleFromUser ? t('calendar.hiddenActivityName') : mappedReg.job.title;
        const notificationMessage = t('notifications.user.approved', { title: displayTitle, comment: t(comment) });
        this.authService.addNotification(mappedReg.user.id, notificationMessage);
        this._handleFullActivity(mappedReg);
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for approveSlotRequest (${registrationId}) failed, operating on local session data.`, err);
        
        let finalApprovedReg: Registration | undefined;

        if (regToApprove.job.isGrouped) {
            const userId = regToApprove.user.id;
            const jobId = regToApprove.job.id;
            this.dataPersistence._registrations.update(regs => regs.map(r => {
                if (r.user.id === userId && r.job.id === jobId) {
                    // FIX: Explicitly type the updated object to ensure it conforms to the Registration interface.
                    const updatedReg: Registration = { ...r, status: 'approved', comment, registeredWithSkill: selectedSkill || r.registeredWithSkill };
                    if (r.id === registrationId) {
                        finalApprovedReg = updatedReg;
                    }
                    return updatedReg;
                }
                return r;
            }));
        } else {
            this.dataPersistence._registrations.update(regs => regs.map(r => {
                if (r.id === registrationId) {
                    // FIX: Explicitly type the updated object to ensure it conforms to the Registration interface.
                    const updatedReg: Registration = { ...r, status: 'approved', comment, registeredWithSkill: selectedSkill || r.registeredWithSkill };
                    finalApprovedReg = updatedReg;
                    return updatedReg;
                }
                return r;
            }));
        }

        if (finalApprovedReg) {
            this.notificationService.show('notifications.registrationApproved');
            const displayTitle = finalApprovedReg.job.hideTitleFromUser ? t('calendar.hiddenActivityName') : finalApprovedReg.job.title;
            const notificationMessage = t('notifications.user.approved', { title: displayTitle, comment: t(comment) });
            this.authService.addNotification(finalApprovedReg.user.id, notificationMessage);
            this._handleFullActivity(finalApprovedReg);
            return of(finalApprovedReg);
        }

        return throwError(() => new Error('Registration not found'));
      })
    );
  }

  private _handleFullActivity(approvedReg: Registration) {
    const slot = this.timeSlots().find(s => s.id === approvedReg.slotId);
    if (!slot) return;
  
    const allRegs = this.registrations();
  
    // Re-check capacity *after* the approval has been processed in the state
    const approvedRegsForActivity = allRegs.filter(r => 
      r.status === 'approved' && (slot.job.isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
    );
  
    const approvedUsers = new Map<string, Registration>();
    for (const reg of approvedRegsForActivity) {
      if (!approvedUsers.has(reg.user.id)) {
        approvedUsers.set(reg.user.id, reg);
      }
    }
    const approvedCount = approvedUsers.size;
    
    const totalCapacity = (slot.capacityMode === 'skill' && slot.capacityBySkill)
      ? Object.values(slot.capacityBySkill).reduce((sum: number, cap: number) => sum + cap, 0)
      : slot.capacity;
  
    if (approvedCount >= totalCapacity) {
      // Activity is full, find and update pending registrations
      const pendingRegsToUpdate = allRegs.filter(r => 
        r.status === 'pending' && 
        (slot.job.isGrouped ? r.job.id === slot.job.id : r.slotId === slot.id)
      );
  
      const pendingRegIdsToUpdate = new Set(pendingRegsToUpdate.map(r => r.id));
  
      if (pendingRegIdsToUpdate.size > 0) {
        const notSelectedCommentKey = 'registrations.notSelectedReason';
        this.dataPersistence._registrations.update(regs => 
          regs.map(r => 
            pendingRegIdsToUpdate.has(r.id) ? { ...r, status: 'not-selected', comment: notSelectedCommentKey } : r
          )
        );
        // In a real app, this would also trigger backend updates.
      }
    }
  }

  public checkMonthlyHiresLimit(registration: Registration): { limitExceeded: boolean; limit: number; currentCount: number } {
    const company = this.companies().find(c => c.id === registration.job.companyId);
    const limit = company?.maxMonthlyHiresPerUser;

    if (!limit || limit <= 0) {
        return { limitExceeded: false, limit: 0, currentCount: 0 };
    }

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const approvedMonthlyRegs = this.registrations().filter(reg => 
        reg.user.id === registration.user.id &&
        reg.job.companyId === registration.job.companyId &&
        reg.status === 'approved' &&
        new Date(reg.startTime).getMonth() === currentMonth &&
        new Date(reg.startTime).getFullYear() === currentYear
    );

    // Count unique jobs, as a grouped activity should only count as one "hire"
    const uniqueJobIds = new Set(approvedMonthlyRegs.map(r => r.job.id));
    const currentCount = uniqueJobIds.size;

    return {
        limitExceeded: currentCount >= limit,
        limit,
        currentCount,
    };
  }

  // --- Companies ---
  addCompany(companyData: Omit<Company, 'id'>): Observable<Company> {
    return this.http.post<Company>(`${this.apiUrl}/companies`, companyData).pipe(
      tap((newCompany: Company) => {
        this.dataPersistence.setOfflineMode(false);
        // FIX: Explicitly type `a` and `b` to resolve type inference issues in array methods.
        this.dataPersistence._companies.update(c => [...c, newCompany].sort((a: Company,b: Company) => a.name.localeCompare(b.name)));
        this.notificationService.show('notifications.companyAdded');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn('API for addCompany failed, operating on local session data.', err);
        if (this.companies().some(c => c.name.toLowerCase() === companyData.name.toLowerCase())) {
            this.notificationService.showError('notifications.companyExists');
            return throwError(() => new Error('Company name already exists.'));
        }
        const newCompany: Company = { ...companyData, id: uuidv4() };
        // FIX: Explicitly type `a` and `b` to resolve type inference issues in array methods.
        this.dataPersistence._companies.update(c => [...c, newCompany].sort((a: Company,b: Company) => a.name.localeCompare(b.name)));
        this.notificationService.show('notifications.companyAdded');
        return of(newCompany);
      })
    );
  }

  updateCompany(id: string, companyData: Omit<Company, 'id'>): Observable<Company> {
    return this.http.put<Company>(`${this.apiUrl}/companies/${id}`, companyData).pipe(
      tap((updatedCompany: Company) => {
        this.dataPersistence.setOfflineMode(false);
        // FIX: Explicitly type `company` to resolve type inference issues in array methods.
        this.dataPersistence._companies.update(c => c.map((company: Company) => company.id === id ? updatedCompany : company));
        this.notificationService.show('notifications.companyUpdated');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for updateCompany (${id}) failed, operating on local session data.`, err);
        if (this.companies().some(c => c.id !== id && c.name.toLowerCase() === companyData.name.toLowerCase())) {
            this.notificationService.showError('notifications.companyUpdateExists');
            return throwError(() => new Error('Another company with this name already exists.'));
        }
        const updatedCompany: Company = { ...companyData, id };
        // FIX: Explicitly type `company` to resolve type inference issues in array methods.
        this.dataPersistence._companies.update(c => c.map((company: Company) => company.id === id ? updatedCompany : company));
        this.notificationService.show('notifications.companyUpdated');
        return of(updatedCompany);
      })
    );
  }

  deleteCompany(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/companies/${id}`).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        this.dataPersistence._companies.update(companies => companies.filter(c => c.id !== id));
        this.notificationService.show('notifications.companyDeleted');
      }),
      catchError((err: HttpErrorResponse) => {
        this.dataPersistence.setOfflineMode(true);
        if (err.status === 409) { // Conflict from API
          this.notificationService.showError('notifications.companyDeleteInUse');
          return throwError(() => err);
        } 
        
        // Fallback for other errors (e.g., connection failed)
        console.warn(`API for deleteCompany (${id}) failed, operating on local session data.`, err);

        // Simulate conflict check on local data
        const isInUse = this.timeSlots().some(ts => ts.job.companyId === id) || this.authService.users().some(u => u.companyIds?.includes(id));
        if (isInUse) {
            this.notificationService.showError('notifications.companyDeleteInUse');
            return throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' }));
        }

        this.dataPersistence._companies.update(companies => companies.filter(c => c.id !== id));
        this.notificationService.show('notifications.companyDeleted');
        return of(undefined);
      })
    );
  }
  
  // --- Skills ---
  addSkill(name: string, companyId: string): Observable<Skill> {
    return this.http.post<Skill>(`${this.apiUrl}/skills`, { name, companyId }).pipe(
      tap((newSkill: Skill) => {
        this.dataPersistence.setOfflineMode(false);
        // FIX: Explicitly type `a` and `b` to resolve type inference issues in array methods.
        this.dataPersistence._skills.update(s => [...s, newSkill].sort((a: Skill, b: Skill) => a.name.localeCompare(b.name)));
        this.notificationService.show('notifications.skillAdded');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for addSkill failed, operating on local session data.`, err);
        if (this.skills().some(s => s.name.toLowerCase() === name.toLowerCase() && s.companyId === companyId)) {
            this.notificationService.showError('notifications.skillExistsForCompany');
            return throwError(() => new Error('Skill name already exists for this company.'));
        }
        const newSkill: Skill = { id: uuidv4(), name, companyId };
        // FIX: Explicitly type `a` and `b` to resolve type inference issues in array methods.
        this.dataPersistence._skills.update(s => [...s, newSkill].sort((a: Skill, b: Skill) => a.name.localeCompare(b.name)));
        this.notificationService.show('notifications.skillAdded');
        return of(newSkill);
      })
    );
  }

  updateSkill(id: string, name: string): Observable<Skill> {
    return this.http.put<Skill>(`${this.apiUrl}/skills/${id}`, { name }).pipe(
      tap((updatedSkill: Skill) => {
        this.dataPersistence.setOfflineMode(false);
        // FIX: Explicitly type `skill` to resolve type inference issues in array methods.
        this.dataPersistence._skills.update(s => s.map((skill: Skill) => skill.id === id ? updatedSkill : skill));
        this.notificationService.show('notifications.skillUpdated');
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for updateSkill (${id}) failed, operating on local session data.`, err);
        const skillToUpdate = this.skills().find(s => s.id === id);
        if (!skillToUpdate) {
            this.notificationService.showError('notifications.skillNotFound');
            return throwError(() => new Error('Skill not found.'));
        }
        if (this.skills().some(s => s.id !== id && s.name.toLowerCase() === name.toLowerCase() && s.companyId === skillToUpdate.companyId)) {
            this.notificationService.showError('notifications.skillExistsForCompany');
            return throwError(() => new Error('Skill with this name already exists for this company.'));
        }
        const updatedSkill: Skill = { ...skillToUpdate, name };
        // FIX: Explicitly type `skill` to resolve type inference issues in array methods.
        this.dataPersistence._skills.update(s => s.map((skill: Skill) => skill.id === id ? updatedSkill : skill));
        this.notificationService.show('notifications.skillUpdated');
        return of(updatedSkill);
      })
    );
  }

  deleteSkill(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/skills/${id}`).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        this.dataPersistence._skills.update(skills => skills.filter(s => s.id !== id));
        this.notificationService.show('notifications.skillDeleted');
      }),
      catchError((err: HttpErrorResponse) => {
        this.dataPersistence.setOfflineMode(true);
        if (err.status === 409) { // Conflict from API
          this.notificationService.showError('notifications.skillDeleteInUse');
          return throwError(() => err);
        } 
        
        // Fallback for other errors
        console.warn(`API for deleteSkill (${id}) failed, operating on local session data.`, err);
        const skillToDelete = this.skills().find(s => s.id === id);
        
        if (skillToDelete) {
            const skillName = skillToDelete.name;
            const companyId = skillToDelete.companyId;

            const isUsedInActivities = this.timeSlots().some(ts => 
                ts.job.companyId === companyId && ts.requiredSkills?.includes(skillName)
            );
            const isUsedByUsers = this.authService.users().some(u => 
                u.skillsByCompany?.[companyId]?.includes(skillName)
            );

            if (isUsedInActivities || isUsedByUsers) {
                this.notificationService.showError('notifications.skillDeleteInUse');
                return throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' }));
            }
        }
        
        this.dataPersistence._skills.update(skills => skills.filter(s => s.id !== id));
        this.notificationService.show('notifications.skillDeleted');
        return of(undefined);
      })
    );
  }

  private notifyUsersOfAvailableSlot(slot: TimeSlot) {
    const approvedRegistrations = this.registrations().filter(r => r.slotId === slot.id && r.status === 'approved').length;
    if (slot.capacity <= approvedRegistrations) {
      return; // Slot is full, no notification needed.
    }
  
    const allUsers = this.authService.users();
    const registeredUserIds = new Set(this.registrations().filter(r => r.slotId === slot.id).map(r => r.user.id));
  
    const targetUsers = allUsers.filter(user => {
      // We only want to notify users who have the 'user' role for this slot's company.
      if (user.rolesByCompany?.[slot.job.companyId] !== 'user') {
        return false;
      }

      // User must be active for this company to receive notifications for new activities.
      const userStatusForCompany = user.statusByCompany?.[slot.job.companyId] ?? 'active';
      if (userStatusForCompany !== 'active') {
        return false;
      }

      if (registeredUserIds.has(user.id)) return false;
      if (!user.companyIds?.includes(slot.job.companyId)) return false;
  
      if (slot.requiredSkills && slot.requiredSkills.length > 0) {
        const userSkillsForCompany = user.skillsByCompany?.[slot.job.companyId] || [];
        const hasAllSkills = slot.requiredSkills.every(reqSkill => userSkillsForCompany.includes(reqSkill));
        if (!hasAllSkills) return false;
      }
  
      return true;
    });
  
    if (targetUsers.length > 0) {
      const t = this.translationService.t();
      const displayTitle = slot.job.hideTitleFromUser ? t('calendar.hiddenActivityName') : slot.job.title;
      const notificationMessage = t('notifications.user.newActivityAvailable', { title: displayTitle, company: slot.job.companyName });
      
      targetUsers.forEach(user => {
        this.authService.addNotification(user.id, notificationMessage).subscribe();
      });
    }
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
}
