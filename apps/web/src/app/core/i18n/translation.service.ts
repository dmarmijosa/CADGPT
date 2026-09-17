import { Injectable, signal } from '@angular/core';
import { SupportedLanguage, TRANSLATIONS } from './translations';

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
      if (typeof navigator !== 'undefined' && navigator.language) {
        if (navigator.language.toLowerCase().startsWith('es')) {
          return 'es';
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

  translate(key: string, params?: Record<string, string | number>): string {
    const lang = this.currentLang();
    const dict = TRANSLATIONS[lang] ?? TRANSLATIONS['en'];
    let template = dict[key] ?? TRANSLATIONS['en'][key] ?? key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        template = template.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return template;
  }

  t(key: string, params?: Record<string, string | number>): string {
    return this.translate(key, params);
  }
}
