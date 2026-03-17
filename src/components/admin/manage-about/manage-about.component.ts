import { Component, ChangeDetectionStrategy, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AboutService } from '../../../services/about.service';
import { NotificationService } from '../../../services/notification.service';
import { Language, TranslationService } from '../../../services/translation.service';

@Component({
  selector: 'app-manage-about',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './manage-about.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ManageAboutComponent {
  aboutService = inject(AboutService);
  notificationService = inject(NotificationService);
  translationService = inject(TranslationService);
  t = this.translationService.t;

  editingLanguage = signal<Language>(this.translationService.currentLanguage());

  aboutForm = new FormGroup({
    imageUrl: new FormControl('', Validators.required),
    description: new FormControl('', Validators.required),
  });

  constructor() {
    effect(() => {
      const lang = this.editingLanguage();
      const allDescriptions = this.aboutService.descriptions();
      const currentDescription = allDescriptions[lang] || allDescriptions['en'];

      this.aboutForm.patchValue({
        imageUrl: this.aboutService.aboutImageUrl(),
        description: currentDescription,
      }, { emitEvent: false });
    });
  }
  
  setEditingLanguage(lang: Language) {
    this.editingLanguage.set(lang);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
          this.notificationService.show('notifications.imageTooLarge', 5000);
          return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        this.aboutForm.get('imageUrl')?.setValue(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onSubmit() {
    if (this.aboutForm.invalid) return;

    const { imageUrl, description } = this.aboutForm.value;
    const lang = this.editingLanguage();
    
    this.aboutService.updateAboutInfo(imageUrl!, description!, lang).subscribe({
        next: () => {
             this.notificationService.show('notifications.aboutUpdated');
        },
        error: (err) => {
            console.error('Failed to update About info', err);
        }
    });
  }
}
