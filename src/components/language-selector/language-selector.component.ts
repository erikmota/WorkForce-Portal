import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService, Language } from '../../services/translation.service';

@Component({
  selector: 'app-language-selector',
  imports: [CommonModule],
  templateUrl: './language-selector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguageSelectorComponent {
  translationService = inject(TranslationService);
  currentLang = this.translationService.currentLanguage;

  languages: { code: Language; flag: string; label: string }[] = [
    { code: 'en', flag: '🇺🇸', label: 'English' },
    { code: 'pt', flag: '🇧🇷', label: 'Português' },
    { code: 'es', flag: '🇪🇸', label: 'Español' },
  ];

  setLanguage(lang: Language) {
    this.translationService.setLanguage(lang);
  }
}
