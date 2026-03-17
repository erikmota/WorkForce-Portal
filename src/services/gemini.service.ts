import { Injectable, inject } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import { NotificationService } from './notification.service';
import { TranslationService } from './translation.service';

declare var process: any; // To access process.env.API_KEY

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private notificationService = inject(NotificationService);
  private translationService = inject(TranslationService);
  private genAI: GoogleGenAI | null = null;

  constructor() {
    try {
      // API_KEY is expected to be set in the environment by the execution context
      if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        this.genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
      } else {
         console.error('Gemini API key not found. AI features will be disabled.');
      }
    } catch (e) {
      console.error('Error initializing Gemini Service. AI features will be disabled.', e);
    }
  }

  isConfigured(): boolean {
    return !!this.genAI;
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.genAI) {
      this.notificationService.showError('notifications.ai.notConfigured');
      return '';
    }

    try {
      const response: GenerateContentResponse = await this.genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      return response.text ?? '';
    } catch (error) {
      console.error('Error generating content with Gemini:', error);
      this.notificationService.showError('notifications.ai.error');
      return '';
    }
  }

  async generateJson(prompt: string, schema: any): Promise<any> {
    if (!this.genAI) {
      this.notificationService.showError('notifications.ai.notConfigured');
      return null;
    }

    try {
      const response: GenerateContentResponse = await this.genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      });
      
      const jsonText = response.text?.trim() ?? '{}';
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Error generating JSON content with Gemini:', error);
      this.notificationService.showError('notifications.ai.error');
      return null;
    }
  }
}