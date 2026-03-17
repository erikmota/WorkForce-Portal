import { Component, ChangeDetectionStrategy, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslationService } from '../../services/translation.service';

@Component({
  selector: 'app-confirmation-modal',
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmationModalComponent {
  message = input.required<string>();
  confirmButtonText = input<string>();
  cancelButtonText = input<string>();
  
  confirm = output<void>();
  cancel = output<void>();

  t = inject(TranslationService).t;

  onConfirm() {
    this.confirm.emit();
  }

  onCancel() {
    this.cancel.emit();
  }
}
