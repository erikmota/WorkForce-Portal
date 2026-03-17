
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notification',
  template: `
    @if (notificationService.isVisible()) {
      <div class="fixed top-5 right-5 text-white py-3 px-6 rounded-lg shadow-lg transform transition-all duration-300 ease-out"
           [class.bg-green-500]="notificationService.type() === 'success'"
           [class.bg-red-500]="notificationService.type() === 'error'"
           [class.translate-y-0]="notificationService.isVisible()"
           [class.opacity-100]="notificationService.isVisible()">
        <div class="flex items-center">
          @if (notificationService.type() === 'success') {
            <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          } @else {
            <svg class="h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
          <span>{{ notificationService.message() }}</span>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationComponent {
  notificationService = inject(NotificationService);
}
