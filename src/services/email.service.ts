import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User } from '../models/user.model';
import { TranslationService } from './translation.service';
import { NotificationService } from './notification.service';
import { of, Observable, tap, catchError } from 'rxjs';
import { environment } from '../environments/environment';
import { DataPersistenceService } from './data-persistence.service';

@Injectable({
  providedIn: 'root',
})
export class EmailService {
  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);
  private translationService = inject(TranslationService);
  private dataPersistence = inject(DataPersistenceService);
  private apiUrl = environment.apiUrl;

  sendWelcomeEmail(user: User): Observable<void> {
    // In a real app, the backend would use the user ID to get info and send an email.
    // We pass the user object here to simulate the backend having access to it.
    return this.http.post<void>(`${this.apiUrl}/emails/send-welcome`, { user }).pipe(
      tap(() => {
        this.dataPersistence.setOfflineMode(false);
        this.notificationService.show('notifications.welcomeEmailSent', 3000, { name: user.name });
        this.simulateEmailInConsole(user);
      }),
      catchError(err => {
        this.dataPersistence.setOfflineMode(true);
        console.warn('API for sendWelcomeEmail failed, simulating email send.', err);
        this.notificationService.show('notifications.welcomeEmailSent', 3000, { name: user.name });
        this.simulateEmailInConsole(user);
        return of(undefined);
      })
    );
  }
  
  sendInvitationEmail(user: User, tempPassword: string): Observable<void> {
    this.simulateInvitationEmailInConsole(user, tempPassword);
    return of(undefined);
  }

  sendPasswordResetEmail(user: User, token: string): Observable<void> {
    this.simulatePasswordResetEmailInConsole(user, token);
    return of(undefined);
  }

  private simulateEmailInConsole(user: User): void {
    const t = this.translationService.t();
    const to = user.username;
    const subject = t('email.welcome.subject');
    const htmlContent = `
      <h1>${t('email.welcome.greeting', { name: user.name })}</h1>
      <p>${t('email.welcome.body1')}</p>
      <ul>
        <li><strong>${t('email.welcome.usernameLabel')}:</strong> ${user.username}</li>
        <li><strong>${t('email.welcome.passwordLabel')}:</strong> ${user.password}</li>
      </ul>
      <p>${t('email.welcome.body2')}</p>
      <p>${t('email.welcome.salutation')}</p>
    `;

    console.log(`--- SIMULATING BACKEND EMAIL (API Call Succeeded or Mocked) ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body (HTML):');
    console.log(htmlContent.replace(/<br>/g, '\n').replace(/<[^>]*>?/gm, ''));
    console.log('-----------------------------------------------------------');
  }

  private simulateInvitationEmailInConsole(user: User, tempPassword: string): void {
    const t = this.translationService.t();
    const to = user.username;
    const subject = t('email.invitation.subject');
    const portalLink = `${window.location.origin}/#/login`;
    const htmlContent = `
      <h1>${t('email.invitation.greeting', { name: user.name })}</h1>
      <p>${t('email.invitation.body1')}</p>
      <p>${t('email.invitation.body2')}</p>
      <ul>
        <li><strong>${t('email.welcome.usernameLabel')}:</strong> ${user.username}</li>
        <li><strong>${t('email.invitation.tempPasswordLabel')}:</strong> ${tempPassword}</li>
      </ul>
      <a href="${portalLink}" style="padding: 10px 15px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">${t('email.invitation.linkText')}</a>
      <p style="margin-top: 15px;">${t('email.invitation.body3')}</p>
      <p>${t('email.welcome.salutation')}</p>
    `;

    console.log(`--- SIMULATING INVITATION EMAIL ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body (HTML):');
    console.log(htmlContent.replace(/<br>/g, '\n').replace(/<[^>]*>?/gm, ''));
    console.log('---------------------------------');
  }

  private simulatePasswordResetEmailInConsole(user: User, token: string): void {
    const t = this.translationService.t();
    const to = user.username;
    const subject = t('email.passwordReset.subject');
    const resetLink = `${window.location.origin}/#/reset-password/${token}`;
    const htmlContent = `
      <h1>${t('email.passwordReset.greeting', { name: user.name })}</h1>
      <p>${t('email.passwordReset.body1')}</p>
      <p>${t('email.passwordReset.body2')}</p>
      <a href="${resetLink}" style="padding: 10px 15px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">${t('email.passwordReset.linkText')}</a>
      <p style="margin-top: 15px;">${t('email.passwordReset.body3')}</p>
      <p>${t('email.welcome.salutation')}</p>
    `;

    console.log(`--- SIMULATING PASSWORD RESET EMAIL ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body (HTML):');
    console.log(htmlContent.replace(/<br>/g, '\n').replace(/<[^>]*>?/gm, ''));
    console.log(`Reset Link: ${resetLink}`);
    console.log('-------------------------------------');
  }
}