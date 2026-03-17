import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root',
})
export class PlatformService {
  isNativePlatform = signal<boolean>(Capacitor.isNativePlatform());
}
