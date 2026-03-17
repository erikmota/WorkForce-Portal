
import { Injectable, signal, inject } from '@angular/core';
import { TranslationService } from './translation.service';

export type NotificationType = 'success' | 'error';

@Injectable({
  providedIn: 'root',
})
export class NotificationService {
  private translationService = inject(TranslationService);
  
  message = signal<string | null>(null);
  isVisible = signal<boolean>(false);
  type = signal<NotificationType>('success');
  
  private timeoutId: any;

  show(messageKey: string, duration: number = 3000, params?: Record<string, string | number | null>) {
    this.display(messageKey, 'success', duration, params);
  }

  showError(messageKey: string, duration: number = 3000, params?: Record<string, string | number | null>) {
    this.display(messageKey, 'error', duration, params);
  }

  private display(messageKey: string, type: NotificationType, duration: number, params?: Record<string, string | number | null>) {
    const translatedMessage = this.translationService.t()(messageKey, params);
    this.message.set(translatedMessage);
    this.type.set(type);
    this.isVisible.set(true);

    if (this.timeoutId) {
        clearTimeout(this.timeoutId);
    }
    
    this.timeoutId = setTimeout(() => {
      this.hide();
    }, duration);
  }

  hide() {
    this.isVisible.set(false);
    // Delay setting message to null to allow for fade-out animation
    setTimeout(() => this.message.set(null), 300);
  }
}
