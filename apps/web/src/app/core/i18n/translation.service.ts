import { Injectable, signal } from '@angular/core';
import { z } from 'zod';
import { SupportedLanguage, TRANSLATIONS, TranslationKey } from './translations';

const translationParamsSchema = z.record(
  z.string().regex(/^[a-zA-Z0-9_]+$/),
  z.union([z.string(), z.number()]),
);

@Injectable({
  providedIn: 'root',
})
export class TranslationService {
  private readonly storageKey = 'cadgpt_lang';

  readonly currentLang = signal<SupportedLanguage>(this.getInitialLanguage());

  private getInitialLanguage(): SupportedLanguage {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(this.storageKey);
        if (stored === 'en' || stored === 'es') {
          return stored;
        }
      }
      if (typeof navigator !== 'undefined') {
        const candidates: string[] = [];
        if (Array.isArray(navigator.languages)) {
          candidates.push(...navigator.languages);
        }
        if (typeof navigator.language === 'string') {
          candidates.push(navigator.language);
        }
        for (const cand of candidates) {
          if (!cand || typeof cand !== 'string') continue;
          const normalized = cand.trim().toLowerCase();
          if (normalized.startsWith('es')) {
            return 'es';
          }
          if (normalized.startsWith('en')) {
            return 'en';
          }
        }
      }
    } catch {
      // Ignore security errors or missing storage
    }
    return 'en';
  }

  switchLanguage(lang: SupportedLanguage): void {
    if (lang !== 'en' && lang !== 'es') {
      return;
    }
    this.currentLang.set(lang);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.storageKey, lang);
      }
    } catch {
      // Ignore storage errors
    }
  }

  translate(key: TranslationKey, params?: Record<string, string | number>): string;
  translate(key: string, params?: Record<string, string | number>): string;
  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS['en'];
    let template: string | undefined;

    if (key in dict) {
      template = dict[key as TranslationKey];
    } else if (key in TRANSLATIONS['en']) {
      template = TRANSLATIONS['en'][key as TranslationKey];
    } else {
      template = key;
    }

    if (params && template) {
      const parsed = translationParamsSchema.safeParse(params);
      if (parsed.success) {
        for (const [k, v] of Object.entries(parsed.data)) {
          template = template.replaceAll(`{${k}}`, String(v));
        }
      }
    }
    return template ?? key;
  }

  t(key: TranslationKey, params?: Record<string, string | number>): string;
  t(key: string, params?: Record<string, string | number>): string;
  t(key: string, params?: Record<string, string | number>): string {
    return this.translate(key, params);
  }
}
