import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { TranslatePipe } from './translate.pipe';

describe('TranslationService & TranslatePipe', () => {
  let service: TranslationService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [TranslationService, TranslatePipe],
    });
    service = TestBed.inject(TranslationService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('defaults to English when localStorage is empty and system locale is non-Spanish', () => {
    expect(service.currentLang()).toBe('en');
  });

  it('reads initial language from localStorage if present', () => {
    localStorage.setItem('cadgpt_lang', 'es');
    const localService = new TranslationService();
    expect(localService.currentLang()).toBe('es');
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
});
