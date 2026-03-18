import { bootstrapApplication } from '@angular/platform-browser';
import { provideZonelessChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import localeEs from '@angular/common/locales/es';
import { Observable } from 'rxjs';

import { AppComponent } from './src/app.component';
import { APP_ROUTES } from './src/app.routes';
import { DataPersistenceService } from './src/services/data-persistence.service';

registerLocaleData(localePt);
registerLocaleData(localeEs);

function initializeAppFactory(
  dataPersistenceService: DataPersistenceService
): () => Observable<any> {
  return () => dataPersistenceService.loadInitialData();
}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(APP_ROUTES, withHashLocation()),
    provideHttpClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAppFactory,
      deps: [DataPersistenceService],
      multi: true,
    },
  ],
}).catch((err) => console.error(err));

// AI Studio always uses an `index.tsx` file for all project types$.

// AI Studio always uses an `index.tsx` file for all project types.