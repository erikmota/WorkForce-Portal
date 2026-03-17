import { Injectable, signal, computed, inject } from '@angular/core';
import { of, Observable } from 'rxjs';
import { TRANSLATIONS } from '../assets/translations';
import { Language, TranslationService } from './translation.service';

@Injectable({
  providedIn: 'root',
})
export class AboutService {
  private translationService = inject(TranslationService);

  aboutImageUrl = signal<string>('/images/Workforce Logo.png');
  
  private _descriptions = signal<Record<Language, string>>({
    en: TRANSLATIONS.en.aboutModal.description,
    pt: TRANSLATIONS.pt.aboutModal.description,
    es: TRANSLATIONS.es.aboutModal.description,
  });

  public readonly descriptions = this._descriptions.asReadonly();

  aboutDescription = computed(() => {
    const lang = this.translationService.currentLanguage();
    return this._descriptions()[lang] || this._descriptions()['en'];
  });

  constructor() {}

  updateAboutInfo(imageUrl: string, description: string, lang: Language): Observable<void> {
    this.aboutImageUrl.set(imageUrl);
    this._descriptions.update(d => ({ ...d, [lang]: description }));
    return of(undefined);
  }
}
