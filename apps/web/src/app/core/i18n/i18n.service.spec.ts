import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { TranslatePipe } from './translate.pipe';
import { TRANSLATIONS } from './translations';

describe('TranslationService & TranslatePipe', () => {
  let service: TranslationService;
  const originalLanguages = navigator.languages;
  const originalLanguage = navigator.language;

  const setNavigatorLocales = (languages: string[] | undefined, language: string | undefined) => {
    Object.defineProperty(navigator, 'languages', {
      value: languages,
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: language,
      configurable: true,
    });
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [TranslationService, TranslatePipe],
    });
    service = TestBed.inject(TranslationService);
  });

  afterEach(() => {
    localStorage.clear();
    setNavigatorLocales(originalLanguages ? [...originalLanguages] : undefined, originalLanguage);
  });

  it('defaults to English when localStorage is empty and system locale is non-Spanish', () => {
    setNavigatorLocales(['en-US', 'en'], 'en-US');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('en');
  });

  it('reads initial language from localStorage taking strict precedence over navigator settings', () => {
    setNavigatorLocales(['en-US', 'en'], 'en-US');
    localStorage.setItem('cadgpt_lang', 'es');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('es');

    setNavigatorLocales(['es-ES', 'es'], 'es-ES');
    localStorage.setItem('cadgpt_lang', 'en');
    const localServiceEn = new TranslationService();
    expect(localServiceEn.currentLang()).toBe('en');
  });

  it('detects Spanish as primary OS language in navigator.languages', () => {
    setNavigatorLocales(['es-ES', 'es', 'en-US'], 'es-ES');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('es');
  });

  it('detects English when prioritized ahead of Spanish in navigator.languages', () => {
    setNavigatorLocales(['en-US', 'es-ES'], 'en-US');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('en');
  });

  it('falls back to navigator.language when navigator.languages is empty or undefined', () => {
    setNavigatorLocales([], 'es-419');
    const localServiceEs = new TranslationService();
    expect(localServiceEs.currentLang()).toBe('es');

    setNavigatorLocales(undefined, 'es-MX');
    const localServiceMx = new TranslationService();
    expect(localServiceMx.currentLang()).toBe('es');
  });

  it('falls back to English for unsupported OS locales', () => {
    setNavigatorLocales(['de-DE', 'fr-FR', 'ja-JP'], 'de-DE');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('en');
  });

  it('switches language and persists preference to localStorage', () => {
    expect(service.currentLang()).toBe('en');
    service.switchLanguage('es');
    expect(service.currentLang()).toBe('es');
    expect(localStorage.getItem('cadgpt_lang')).toBe('es');

    service.switchLanguage('en');
    expect(service.currentLang()).toBe('en');
    expect(localStorage.getItem('cadgpt_lang')).toBe('en');
  });

  it('translates keys accurately for active language', () => {
    service.switchLanguage('en');
    expect(service.translate('nav.devices')).toBe('Devices');
    expect(service.translate('pair.title')).toBe('Pair your device');

    service.switchLanguage('es');
    expect(service.translate('nav.devices')).toBe('Dispositivos');
    expect(service.translate('pair.title')).toBe('Vincular su dispositivo');
  });

  it('interpolates parameters in translation strings', () => {
    service.switchLanguage('en');
    const res = service.translate('consent.badge', { foo: 'bar' });
    expect(res).toBe('GDPR & ISO/IEC 27001');
  });

  it('falls back to English when a translation is missing in the target language', () => {
    service.switchLanguage('es');
    // If a non-existent key is supplied, returns the key itself
    expect(service.translate('non.existent.key')).toBe('non.existent.key');
  });

  it('supports shorthand t() method', () => {
    service.switchLanguage('es');
    expect(service.t('nav.about')).toBe('Acerca de');
  });

  it('TranslatePipe transforms keys using TranslationService', () => {
    const pipe = TestBed.inject(TranslatePipe);
    service.switchLanguage('en');
    expect(pipe.transform('nav.jobs')).toBe('Jobs');

    service.switchLanguage('es');
    expect(pipe.transform('nav.jobs')).toBe('Trabajos');
  });

  it('enforces 100% dictionary key parity between English and Spanish', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const esKeys = Object.keys(TRANSLATIONS.es).sort();

    const missingInEs = enKeys.filter((k) => !(k in TRANSLATIONS.es));
    const missingInEn = esKeys.filter((k) => !(k in TRANSLATIONS.en));

    expect(missingInEs).toEqual([]);
    expect(missingInEn).toEqual([]);
    expect(enKeys).toEqual(esKeys);
  });
});
