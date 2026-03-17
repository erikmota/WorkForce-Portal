import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NotificationComponent } from './components/notification/notification.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NotificationComponent],
  template: `
    <router-outlet></router-outlet>
    <app-notification></app-notification>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {}
