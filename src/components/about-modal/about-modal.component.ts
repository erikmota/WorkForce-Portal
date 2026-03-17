import { Component, ChangeDetectionStrategy, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AboutService } from '../../services/about.service';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-about-modal',
  imports: [CommonModule],
  templateUrl: './about-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutModalComponent {
  close = output<void>();
  
  aboutService = inject(AboutService);
  translationService = inject(TranslationService);
  t = this.translationService.t;

  onClose() {
    this.close.emit();
  }
}
