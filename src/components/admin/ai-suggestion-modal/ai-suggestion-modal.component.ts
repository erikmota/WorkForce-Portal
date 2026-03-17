import { Component, ChangeDetectionStrategy, computed, inject, input, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JobService } from '../../../services/job.service';
import { AuthService } from '../../../services/auth.service';
import { Registration } from '../../../models/registration.model';
import { TranslationService } from '../../../services/translation.service';
import { User } from '../../../models/user.model';
import { GeminiService } from '../../../services/gemini.service';
import { Type } from '@google/genai';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { UserQuickViewModalComponent } from '../../user-quick-view-modal/user-quick-view-modal.component';

// Copied from manage-requests.component.ts
interface GroupedRequestItem {
  jobTitle: string;
  jobDescription: string;
  jobLocation: string;
  companyName: string;
  startTime: Date;
  registrations: Registration[];
  isGroup: boolean;
  endTime?: Date;
  requiredSkills?: string[];
  capacityDetails?: {
    mode: 'activity' | 'skill';
    totalApproved: number;
    totalCapacity: number;
    skills?: {
      name: string;
      approved: number;
      capacity: number;
    }[];
  };
  offersTransportation?: boolean;
  transportationDepartureTime?: string;
  transportationDepartureLocation?: string;
  transportationNotes?: string;
}

interface Suggestion {
  registration: Registration;
  reason: string;
  selectedSkill?: string;
}

interface AiResponse {
  rationale: string;
  approvals: { registrationId: string; reason: string; selectedSkill?: string }[];
  rejections: { registrationId: string; reason: string }[];
}


@Component({
  selector: 'app-ai-suggestion-modal',
  imports: [CommonModule, ReactiveFormsModule, UserQuickViewModalComponent],
  templateUrl: './ai-suggestion-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiSuggestionModalComponent implements OnInit {
  group = input.required<GroupedRequestItem>();
  close = output<void>();
  apply = output<{ approvals: { registrationId: string; selectedSkill?: string }[] }>();

  jobService = inject(JobService);
  authService = inject(AuthService);
  geminiService = inject(GeminiService);
  translationService = inject(TranslationService);
  t = this.translationService.t;

  isLoading = signal<boolean>(true);
  suggestion = signal<{ approvals: Suggestion[]; rejections: Suggestion[] } | null>(null);
  error = signal<string | null>(null);
  
  // Chat state
  chatHistory = signal<{ role: 'user' | 'model', text: string }[]>([]);
  isRefining = signal(false);
  refineControl = new FormControl('');

  // User Quick View Modal state
  isUserQuickViewOpen = signal(false);
  selectedUserForQuickView = signal<User | null>(null);

  ngOnInit(): void {
    this.getInitialSuggestion();
  }

  onClose() {
    this.close.emit();
  }

  async getInitialSuggestion(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    this.suggestion.set(null);
    const currentGroup = this.group();

    if (!this.geminiService.isConfigured()) {
        this.error.set(this.t()('notifications.ai.notConfigured'));
        this.isLoading.set(false);
        return;
    }

    try {
      const prompt = this.buildPrompt(currentGroup);
      const schema = this.getResponseSchema();
      const response: AiResponse | null = await this.geminiService.generateJson(prompt, schema);
      
      if (response && response.approvals) {
        this.processResponse(response);
        this.chatHistory.set([{ role: 'model', text: response.rationale }]);
      } else {
        this.error.set(this.t()('ai.noSuggestions'));
      }
    } catch (e) {
      console.error('AI suggestion failed', e);
      this.error.set(this.t()('ai.noSuggestions'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async refineSuggestion(): Promise<void> {
    const refinement = this.refineControl.value?.trim();
    if (!refinement || this.isRefining()) return;

    this.isRefining.set(true);
    this.error.set(null);
    this.chatHistory.update(history => [...history, { role: 'user', text: refinement }]);
    
    const currentGroup = this.group();

    try {
      const prompt = this.buildPrompt(currentGroup, refinement);
      const schema = this.getResponseSchema();
      const response: AiResponse | null = await this.geminiService.generateJson(prompt, schema);

      if (response && response.approvals) {
        this.processResponse(response);
        this.chatHistory.update(history => [...history, { role: 'model', text: response.rationale }]);
      } else {
        this.error.set(this.t()('ai.noSuggestions'));
        this.chatHistory.update(history => [...history, { role: 'model', text: this.t()('ai.noSuggestions') }]);
      }
    } catch (e) {
      console.error('AI refinement failed', e);
      this.error.set(this.t()('ai.noSuggestions'));
       this.chatHistory.update(history => [...history, { role: 'model', text: this.t()('ai.noSuggestions') }]);
    } finally {
      this.isRefining.set(false);
      this.refineControl.setValue('');
    }
  }

  onApply() {
    const currentSuggestion = this.suggestion();
    if (currentSuggestion?.approvals) {
      const approvals = currentSuggestion.approvals.map(s => ({
        registrationId: s.registration.id,
        selectedSkill: s.selectedSkill
      }));
      this.apply.emit({ approvals });
    }
  }

  openUserQuickView(user: User) {
    this.selectedUserForQuickView.set(user);
    this.isUserQuickViewOpen.set(true);
  }

  closeUserQuickView() {
    this.isUserQuickViewOpen.set(false);
    this.selectedUserForQuickView.set(null);
  }

  private processResponse(response: AiResponse) {
    const currentGroup = this.group();
    const allCandidates = currentGroup.registrations;

    const approvals: Suggestion[] = response.approvals
      .map((approval): Suggestion | null => {
        const registration = allCandidates.find(r => r.id === approval.registrationId);
        if (!registration) return null;
        return {
          registration,
          reason: approval.reason,
          selectedSkill: approval.selectedSkill,
        };
      })
      .filter((s): s is Suggestion => s !== null);

    const rejections: Suggestion[] = response.rejections
      .map(rejection => {
        const registration = allCandidates.find(r => r.id === rejection.registrationId);
        if (!registration) return null;
        return {
          registration,
          reason: rejection.reason,
        };
      })
      .filter((s): s is Suggestion => s !== null);

    this.suggestion.set({ approvals, rejections });
  }

  private getResponseSchema() {
    return {
      type: Type.OBJECT,
      properties: {
        rationale: { type: Type.STRING, description: 'A detailed explanation of the reasoning behind the approvals and rejections, considering skills, capacity, and user history.' },
        approvals: {
          type: Type.ARRAY,
          description: 'A list of candidates recommended for approval.',
          items: {
            type: Type.OBJECT,
            properties: {
              registrationId: { type: Type.STRING, description: 'The unique ID of the registration.' },
              reason: { type: Type.STRING, description: 'A brief, specific reason for recommending this candidate.' },
              selectedSkill: { type: Type.STRING, description: 'If capacity is by skill, specify which skill the user should be approved for. Must be one of the required skills.' },
            },
            required: ['registrationId', 'reason'],
          }
        },
        rejections: {
          type: Type.ARRAY,
          description: 'A list of candidates considered but not recommended for approval, with reasons.',
          items: {
            type: Type.OBJECT,
            properties: {
              registrationId: { type: Type.STRING, description: 'The unique ID of the registration.' },
              reason: { type: Type.STRING, description: 'A brief, specific reason for not recommending this candidate.' },
            },
            required: ['registrationId', 'reason'],
          }
        }
      },
      required: ['rationale', 'approvals', 'rejections'],
    };
  }

  private buildPrompt(group: GroupedRequestItem, refinement?: string): string {
    const t = this.t();
    
    const activityDetails = t('ai.prompt.activityDetails', {
      jobTitle: group.jobTitle,
      jobDescription: group.jobDescription,
      jobLocation: group.jobLocation,
    });
    
    let transportationInfo = '';
    if (group.offersTransportation) {
      transportationInfo = t('ai.prompt.transportationInfo', {
        offersTransportation: group.offersTransportation ? t('general.yes') : t('general.no'),
        departureTime: group.transportationDepartureTime || 'N/A',
        departureLocation: group.transportationDepartureLocation || 'N/A',
        transportationNotes: group.transportationNotes || t('ai.prompt.noSkills')
      });
    }

    const candidateDetails = group.registrations.map(reg => {
      const userSkills = reg.user.skillsByCompany?.[reg.job.companyId]?.join(', ') || t('ai.prompt.noSkills');
      return t('ai.prompt.candidateLine', {
        name: reg.user.name,
        id: reg.user.id,
        skills: userSkills,
        regId: reg.id,
        needsTransportation: reg.needsTransportation ? t('general.yes') : t('general.no'),
        transportationNotes: reg.transportationNotes || t('ai.prompt.noSkills'),
        dailyRate: reg.user.dailyRate || 0
      });
    }).join('\n');

    let capacityInfo = '';
    if (group.capacityDetails) {
      if (group.capacityDetails.mode === 'skill') {
        const skillDetails = group.capacityDetails.skills?.map(s => 
          t('ai.prompt.skillCapacity', {
            name: s.name,
            approved: s.approved,
            capacity: s.capacity
          })
        ).join(', ');
        capacityInfo = t('ai.prompt.capacityBySkill', {
          skillDetails: skillDetails ?? '',
          totalApproved: group.capacityDetails.totalApproved,
          totalCapacity: group.capacityDetails.totalCapacity
        });
      } else {
        capacityInfo = t('ai.prompt.capacityOverall', {
          totalApproved: group.capacityDetails.totalApproved,
          totalCapacity: group.capacityDetails.totalCapacity
        });
      }
    }
    
    const originalContext = `
      ${t('ai.prompt.role')}

      ${activityDetails}
      ${transportationInfo}

      ${capacityInfo}

      ${t('ai.prompt.pendingCandidates')}:
      ${candidateDetails}

      ${t('ai.prompt.analysisInstruction')}

      ${t('ai.prompt.jsonInstruction')}
    `.trim();

    if (refinement) {
      const refinementInstruction = t('ai.prompt.refinementInstruction', { refinement });
      // Prepend the refinement instruction to make it the primary context.
      return `${refinementInstruction}\n\n--- ORIGINAL CONTEXT ---\n\n${originalContext}`;
    }

    return originalContext;
  }
}