import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, throwError, of, map, catchError, tap, switchMap } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../models/user.model';
import { environment } from '../environments/environment';
import { MOCK_USERS } from '../data/mock-data';
import { DataPersistenceService } from './data-persistence.service';
import { NotificationService } from './notification.service';
import { PlatformService } from './platform.service';
import { AuditService } from './audit.service';
import { EmailService } from './email.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  // FIX: Explicitly type `router` as `Router` to resolve type inference issue.
  private router: Router = inject(Router);
  private dataPersistence = inject(DataPersistenceService);
  private notificationService = inject(NotificationService);
  private platformService = inject(PlatformService);
  private auditService = inject(AuditService);
  private emailService = inject(EmailService);
  private apiUrl = environment.apiUrl;
  private readonly TOKEN_KEY = 'workforce_portal_auth_token';
  
  // State is now managed by DataPersistenceService
  public readonly users = this.dataPersistence.users;
  public readonly currentUser = signal<User | null>(null);
  public readonly onboardingUser = signal<User | null>(null);

  // Role-based computed signals
  public readonly isCurrentUserGlobalAdmin = computed(() => !!this.currentUser()?.isGlobalAdmin);
  public readonly isCurrentUserCompanyAdmin = computed(() => {
    const user = this.currentUser();
    if (!user || user.isGlobalAdmin) return false;
    return Object.values(user.rolesByCompany ?? {}).includes('company-admin');
  });

  public readonly endUsers = computed(() => {
    return this.users().filter(user => {
      const isCompanyAdmin = Object.values(user.rolesByCompany ?? {}).includes('company-admin');
      return !user.isGlobalAdmin && !isCompanyAdmin;
    });
  });

  constructor() {
    this.tryAutoLogin();
  }

  private tryAutoLogin(): void {
    if (this.platformService.isNativePlatform()) {
      try {
        const storedTokenData = localStorage.getItem(this.TOKEN_KEY);
        if (storedTokenData) {
          const { userId, token } = JSON.parse(storedTokenData);
          // In a real app, we would validate the token with a backend.
          // Here, we just check if it exists and find the user.
          if (userId && token) {
            const user = this.users().find(u => u.id === userId);
            if (user) {
              if(user.needsOnboarding) {
                this.onboardingUser.set(user);
                this.router.navigate(['/onboarding']);
                return;
              }

              // Check if user account is still active
              const adminCompanyIds = Object.entries(user.rolesByCompany ?? {}).filter(([,role]) => role === 'company-admin').map(([id]) => id);
              if (adminCompanyIds.length > 0) {
                  const isInactiveInAllAdminCompanies = adminCompanyIds.every(id => user.statusByCompany?.[id] === 'inactive');
                  if (isInactiveInAllAdminCompanies) {
                      // Account is inactive, don't auto-login
                      localStorage.removeItem(this.TOKEN_KEY);
                      return;
                  }
              }
              this.currentUser.set(user);
            } else {
              // User not found, clear invalid token
              localStorage.removeItem(this.TOKEN_KEY);
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse auth token from localStorage', e);
        localStorage.removeItem(this.TOKEN_KEY);
      }
    }
  }

  loadUsers(): Observable<void> {
    // Data is loaded in DataPersistenceService constructor, so this can be a no-op returning success.
    // It's kept for now to avoid breaking the initial loading sequence in portal.component.
    return of(undefined);
  }

  login(username: string, password: string): Observable<User> {
    const user = this.users().find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);

    if (user) {
      if (user.needsOnboarding) {
        this.onboardingUser.set(user);
        return of(user);
      }

      const adminCompanyIds = Object.entries(user.rolesByCompany ?? {}).filter(([,role]) => role === 'company-admin').map(([id]) => id);
      if (adminCompanyIds.length > 0) {
        const isInactiveInAllAdminCompanies = adminCompanyIds.every(id => user.statusByCompany?.[id] === 'inactive');
        if (isInactiveInAllAdminCompanies) {
          return throwError(() => new Error('Account is inactive'));
        }
      }

      this.currentUser.set(user);
      if (this.platformService.isNativePlatform()) {
        const token = uuidv4();
        localStorage.setItem(this.TOKEN_KEY, JSON.stringify({ userId: user.id, token }));
      }
      return of(user);
    }

    return throwError(() => new Error('Invalid credentials'));
  }

  logout() {
    this.currentUser.set(null);
    this.onboardingUser.set(null);
    if (this.platformService.isNativePlatform()) {
      localStorage.removeItem(this.TOKEN_KEY);
    }
    this.router.navigate(['/login']);
  }

  inviteUser(userData: { username: string; isGlobalAdmin: boolean; companyIds: string[]; rolesByCompany: Record<string, 'user' | 'company-admin'>; skillsByCompany: Record<string, string[]> }): Observable<User> {
    const tempPassword = Math.random().toString(36).slice(-8);
    const nameFromEmail = userData.username.split('@')[0];

    const newUser: User = {
      id: uuidv4(),
      username: userData.username,
      name: nameFromEmail,
      password: tempPassword, 
      isGlobalAdmin: userData.isGlobalAdmin,
      companyIds: userData.isGlobalAdmin ? [] : userData.companyIds,
      rolesByCompany: userData.isGlobalAdmin ? {} : userData.rolesByCompany,
      statusByCompany: userData.companyIds.reduce((acc, id) => ({ ...acc, [id]: 'active' }), {}),
      skillsByCompany: userData.isGlobalAdmin ? {} : userData.skillsByCompany,
      notifications: [],
      needsOnboarding: true,
      phone: '',
      address: {},
      bankDetails: {}
    };

    return this.http.post<User>(`${this.apiUrl}/users`, newUser).pipe(
      tap((createdUser) => {
        this.dataPersistence._users.update(users => [...users, createdUser]);
        this.emailService.sendInvitationEmail(createdUser, tempPassword).subscribe();
      }),
      catchError(err => {
        console.warn('API for inviteUser failed, operating on local session data.', err);
        this.dataPersistence._users.update(users => [...users, newUser]);
        this.emailService.sendInvitationEmail(newUser, tempPassword).subscribe();
        return of(newUser);
      })
    );
  }

  completeOnboarding(userId: string, updateData: Partial<User>): Observable<void> {
    const userToUpdate = this.users().find(u => u.id === userId);
    if (!userToUpdate || !userToUpdate.needsOnboarding) {
      return throwError(() => new Error('User not found or onboarding already completed.'));
    }

    const finalUser: User = {
      ...userToUpdate,
      ...updateData,
      needsOnboarding: false,
    };

    return this.updateUser(finalUser).pipe(
      // FIX: Explicitly type `updatedUser` as `User` to resolve type inference issue.
      switchMap((updatedUser: User) => this.login(updatedUser.username, updatedUser.password))
    ).pipe(map(() => undefined));
  }

  updateUser(updatedUser: User): Observable<User> {
    const originalUser = this.users().find(u => u.id === updatedUser.id);
    const changedByUser = this.currentUser();
    
    if (originalUser && changedByUser) {
      this.auditService.logChange(originalUser, 'phone', originalUser.phone, updatedUser.phone, changedByUser);
      this.auditService.logChange(originalUser, 'address', originalUser.address, updatedUser.address, changedByUser);
      this.auditService.logChange(originalUser, 'bankDetails', originalUser.bankDetails, updatedUser.bankDetails, changedByUser);
      this.auditService.logChange(originalUser, 'dailyRate', originalUser.dailyRate, updatedUser.dailyRate, changedByUser);
    }

    return this.http.put<User>(`${this.apiUrl}/users/${updatedUser.id}`, updatedUser).pipe(
      // FIX: Explicitly type `savedUser` to resolve type inference issues.
      tap((savedUser: User) => {
        this.dataPersistence.setOfflineMode(false);
        // FIX: Explicitly type `u` to resolve type inference issues in array methods.
        this.dataPersistence._users.update(users => users.map((u: User) => u.id === savedUser.id ? savedUser : u));
        if (this.currentUser()?.id === savedUser.id) {
          const adminCompanyIds = Object.entries(savedUser.rolesByCompany ?? {}).filter(([,role]) => role === 'company-admin').map(([id]) => id);
          if (adminCompanyIds.length > 0) {
              const isInactiveInAllAdminCompanies = adminCompanyIds.every(id => savedUser.statusByCompany?.[id] === 'inactive');
              if (isInactiveInAllAdminCompanies) {
                  this.notificationService.showError('notifications.accountDeactivated');
                  this.logout();
                  return;
              }
          }
          this.currentUser.set(savedUser);
        }
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for updateUser (${updatedUser.id}) failed, operating on local session data.`, err);
        this.dataPersistence._users.update(users => users.map(u => u.id === updatedUser.id ? updatedUser : u));
        if (this.currentUser()?.id === updatedUser.id) {
          const adminCompanyIds = Object.entries(updatedUser.rolesByCompany ?? {}).filter(([,role]) => role === 'company-admin').map(([id]) => id);
          if (adminCompanyIds.length > 0) {
              const isInactiveInAllAdminCompanies = adminCompanyIds.every(id => updatedUser.statusByCompany?.[id] === 'inactive');
              if (isInactiveInAllAdminCompanies) {
                  this.notificationService.showError('notifications.accountDeactivated');
                  this.logout();
              } else {
                 this.currentUser.set(updatedUser);
              }
          } else {
             this.currentUser.set(updatedUser);
          }
        }
        return of(updatedUser);
      })
    );
  }

  resetPasswordForInvitedUser(userId: string): Observable<string | null> {
    const userToUpdate = this.users().find(u => u.id === userId);

    if (!userToUpdate || !userToUpdate.needsOnboarding) {
      return of(null);
    }

    const newTempPassword = Math.random().toString(36).slice(-8);
    const updatedUser: User = { ...userToUpdate, password: newTempPassword };

    return this.updateUser(updatedUser).pipe(
      map(() => newTempPassword),
      catchError(err => {
        // Even on API error, offline mode has updated the local state,
        // so we can still provide the password to the admin.
        console.error('Error updating password on backend, but persisted locally.', err);
        return of(newTempPassword);
      })
    );
  }

  changePassword(userId: string, currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/users/${userId}/change-password`, { currentPassword, newPassword }).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        if (this.currentUser()?.id === userId) {
            this.currentUser.update(u => u ? { ...u, password: newPassword } : null);
        }
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn(`API for changePassword (${userId}) failed, operating on local session data.`, err);
        const user = this.users().find(u => u.id === userId);
        if (user && user.password === currentPassword) {
            this.dataPersistence._users.update(users => users.map(u => u.id === userId ? {...u, password: newPassword} : u));
            if (this.currentUser()?.id === userId) {
                this.currentUser.update(u => u ? { ...u, password: newPassword } : null);
            }
            return of(undefined);
        }
        return throwError(() => new Error('Password does not match'));
      })
    );
  }

  requestPasswordReset(email: string): Observable<void> {
    const user = this.users().find(u => u.username.toLowerCase() === email.toLowerCase());
    if (!user) {
      // Don't throw an error, to prevent email enumeration attacks. Just return success.
      return of(undefined);
    }

    const resetToken = uuidv4();
    const tokenExpiry = new Date(new Date().getTime() + 3600 * 1000); // 1 hour expiry

    const updatedUser: User = {
      ...user,
      passwordResetToken: resetToken,
      passwordResetTokenExpires: tokenExpiry
    };

    return this.updateUser(updatedUser).pipe(
      tap(() => {
        this.emailService.sendPasswordResetEmail(updatedUser, resetToken).subscribe();
      }),
      map(() => undefined) // Don't return user data
    );
  }

  resetPasswordWithToken(token: string, newPassword: string): Observable<void> {
    const user = this.users().find(u => u.passwordResetToken === token);

    if (!user || !user.passwordResetTokenExpires) {
      return throwError(() => new Error('Invalid or expired token'));
    }

    if (new Date(user.passwordResetTokenExpires).getTime() < new Date().getTime()) {
      return throwError(() => new Error('Invalid or expired token'));
    }

    const updatedUser: User = {
      ...user,
      password: newPassword,
      passwordResetToken: undefined,
      passwordResetTokenExpires: undefined
    };

    return this.updateUser(updatedUser).pipe(map(() => undefined));
  }

  addNotification(userId: string, message: string): Observable<void> {
    const user = this.users().find(u => u.id === userId);
    if (!user) return of(undefined);
    
    const notifications = user.notifications ? [...user.notifications, message] : [message];
    const updatedUser = { ...user, notifications };

    // Optimistically update UI
    if (this.currentUser()?.id === updatedUser.id) {
        this.currentUser.set(updatedUser);
    }
    this.dataPersistence._users.update(users => users.map(u => u.id === updatedUser.id ? updatedUser : u));

    return this.http.put<void>(`${this.apiUrl}/users/${userId}`, updatedUser).pipe(
      tap(() => this.dataPersistence.setOfflineMode(false)),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        // On API failure, the optimistic update is already persisted to session storage.
        console.warn(`API for addNotification (${userId}) failed, change persisted in local session data.`, err);
        return of(undefined); // Return success so subscribers don't see an error.
      })
    );
  }

  clearNotifications(userId: string) {
    const user = this.users().find(u => u.id === userId);
    if (user) {
      const updatedUser = { ...user, notifications: [] };
       this.updateUser(updatedUser).subscribe();
    }
  }
}