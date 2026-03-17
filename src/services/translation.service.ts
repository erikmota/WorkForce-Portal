
import { Injectable, signal, computed } from '@angular/core';
import { TRANSLATIONS } from '../assets/translations';

export type Language = 'en' | 'pt' | 'es';

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private language = signal<Language>(this.getInitialLanguage());
  private dictionary = signal<Record<string, any>>(TRANSLATIONS);

  currentLanguage = this.language.asReadonly();

  public readonly languages: { code: Language; flag: string; label: string }[] = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'pt', flag: '🇧🇷', label: 'Português' },
    { code: 'es', flag: '🇪🇸', label: 'Español' },
  ];

  // A computed signal that returns a translation function for the current language.
  // Components can use this to translate keys reactively.
  public t = computed(() => (key: string, params?: Record<string, string | number | null>): string => {
    const lang = this.language();
    const dict = this.dictionary();
    
    // Navigate through nested keys (e.g., 'header.title')
    let translation = key.split('.').reduce((o, i) => o?.[i], dict[lang]);

    if (!translation) {
      // Fallback to English if translation is not found in the current language
      translation = key.split('.').reduce((o, i) => o?.[i], dict['en']);
    }

    if (!translation) {
      // Fallback to the key itself if not found in English either
      return key;
    }
    
    // Replace placeholders like {{name}} with actual values
    if (params) {
      Object.keys(params).forEach(paramKey => {
        const regex = new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g');
        translation = translation.replace(regex, String(params[paramKey] ?? ''));
      });
    }

    return translation;
  });

  private getInitialLanguage(): Language {
    const savedLang = localStorage.getItem('app-lang') as Language;
    if (savedLang && ['en', 'pt', 'es'].includes(savedLang)) {
      return savedLang;
    }
    // Default to browser language if available, else English
    const browserLang = navigator.language.split('-')[0];
    if (browserLang === 'pt') return 'pt';
    if (browserLang === 'es') return 'es';
    return 'en';
  }

  setLanguage(lang: Language) {
    this.language.set(lang);
    localStorage.setItem('app-lang', lang);
  }
}
