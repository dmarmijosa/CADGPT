import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { AuthService } from '../../core/auth/auth.service';
import { Shell } from './shell';

describe('Shell (header, left rail nav, and footer)', () => {
  it('renders the primary nav and marks the active link on /devices', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => true,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const rail = shellElement.querySelector('nav[aria-label="Primary"]');
    expect(rail).toBeTruthy();

    const active = rail!.querySelector('a[aria-current="page"]');
    expect(active?.textContent?.trim()).toBe('Devices');

    // Brand and version tag
    const brand = shellElement.querySelector('.brand');
    expect(brand?.textContent?.trim()).toContain('CAD Engine');
    const versionTag = shellElement.querySelector('.version-tag');
    expect(versionTag?.textContent?.trim()).toBe('v0.2.0-alpha.1');

    // Daemon status indicator
    const statusIndicator = shellElement.querySelector('.status-indicator');
    expect(statusIndicator?.textContent?.trim()).toContain('Daemon Online');

    // Authenticated user in header
    const userBadge = shellElement.querySelector('.user-name');
    expect(userBadge?.textContent?.trim()).toBe('ada');

    // Footer
    const footer = shellElement.querySelector('footer');
    expect(footer?.textContent).toContain('CAD Agent Designer');
    expect(footer?.textContent).toContain('AutoCAD Core Console parity');
  });

  it('renders sign in button when unauthenticated', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => null,
      token: () => null,
      login: vi.fn(),
      logout: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/about');

    const shellElement = harness.routeNativeElement!;
    const signInBtn = shellElement.querySelector('nav[aria-label="Account"] button');
    expect(signInBtn?.textContent?.trim()).toBe('Sign in');
  });

  it('displays consent bottom sheet and backdrop when authenticated user lacks consent (spec: modal interception)', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { sub: 'new-sub', preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => false,
      recordConsent: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const sheet = shellElement.querySelector('#consent-sheet');
    const backdrop = shellElement.querySelector('#consent-backdrop');

    expect(sheet).toBeTruthy();
    expect(backdrop).toBeTruthy();
    expect(sheet?.getAttribute('role')).toBe('dialog');
    expect(sheet?.getAttribute('aria-modal')).toBe('true');
    expect(sheet?.getAttribute('aria-labelledby')).toBe('consent-title');

    const badge = sheet?.querySelector('.stitch-consent-badge');
    expect(badge?.textContent?.trim()).toBe('GDPR & ISO/IEC 27001');

    const title = sheet?.querySelector('#consent-title');
    expect(title?.textContent?.trim()).toMatch(
      /Tratamiento de Datos y Gobernanza CAD|Data Processing and CAD Governance/,
    );

    // Disclosures
    expect(sheet?.textContent).toMatch(/Ejecución Local CAD|Local CAD Execution/);
    expect(sheet?.textContent).toMatch(/Retención de Mallas STL|STL Mesh Retention/);
    expect(sheet?.textContent).toMatch(/Derecho al Olvido|Right to Be Forgotten/);

    // Checkbox and disabled button
    const checkbox = sheet?.querySelector('#consent-accept-check') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);

    const acceptBtn = sheet?.querySelector('#consent-accept-btn') as HTMLButtonElement;
    expect(acceptBtn).toBeTruthy();
    expect(acceptBtn.disabled).toBe(true);
    expect(acceptBtn.textContent?.trim()).toMatch(/Aceptar y Continuar|Accept and Continue/);
  });

  it('gates acceptance button on mandatory checkbox toggle (spec: checkbox gating)', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { sub: 'new-sub', preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => false,
      recordConsent: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const checkbox = shellElement.querySelector('#consent-accept-check') as HTMLInputElement;
    const acceptBtn = shellElement.querySelector('#consent-accept-btn') as HTMLButtonElement;

    expect(acceptBtn.disabled).toBe(true);

    // Check the checkbox
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(acceptBtn.disabled).toBe(false);

    // Uncheck the checkbox
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    expect(acceptBtn.disabled).toBe(true);
  });

  it('persists consent and dismisses bottom sheet upon clicking accept (spec: consent acknowledgment)', async () => {
    const hasConsentSignal = signal(false);
    const recordConsent = vi.fn(() => {
      hasConsentSignal.set(true);
    });
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { sub: 'new-sub', preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: hasConsentSignal,
      recordConsent,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const checkbox = shellElement.querySelector('#consent-accept-check') as HTMLInputElement;
    const acceptBtn = shellElement.querySelector('#consent-accept-btn') as HTMLButtonElement;

    expect(shellElement.querySelector('#consent-sheet')).toBeTruthy();

    // Check and click accept
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await harness.fixture.whenStable();

    acceptBtn.click();
    await harness.fixture.whenStable();

    expect(recordConsent).toHaveBeenCalledTimes(1);
    expect(shellElement.querySelector('#consent-sheet')).toBeNull();
    expect(shellElement.querySelector('#consent-backdrop')).toBeNull();
  });

  it('does not display consent sheet when user already has consent (spec: returning user bypass)', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { sub: 'returning-sub', preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => true,
      recordConsent: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    expect(shellElement.querySelector('#consent-sheet')).toBeNull();
    expect(shellElement.querySelector('#consent-backdrop')).toBeNull();
  });

  it('switches interface language dynamically between EN and ES in shell header', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => true,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const esBtn = Array.from(shellElement.querySelectorAll('.lang-btn')).find(
      (b) => b.textContent?.trim() === 'ES',
    ) as HTMLButtonElement;
    expect(esBtn).toBeTruthy();

    esBtn.click();
    await harness.fixture.whenStable();

    const rail = shellElement.querySelector('nav[aria-label="Primary"]');
    const active = rail!.querySelector('a[aria-current="page"]');
    expect(active?.textContent?.trim()).toBe('Dispositivos');

    const enBtn = Array.from(shellElement.querySelectorAll('.lang-btn')).find(
      (b) => b.textContent?.trim() === 'EN',
    ) as HTMLButtonElement;
    enBtn.click();
    await harness.fixture.whenStable();
    expect(active?.textContent?.trim()).toBe('Devices');
  });

  it('renders author attribution to Danny Armijos with secure LinkedIn and personal website links', async () => {
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => true,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    const footer = shellElement.querySelector('footer');
    expect(footer).toBeTruthy();

    const authorSection = footer!.querySelector('.footer-author');
    expect(authorSection).toBeTruthy();
    expect(authorSection?.textContent).toContain('Danny Armijos');

    // LinkedIn link
    const linkedinLink = authorSection!.querySelector(
      'a[href="https://www.linkedin.com/in/dmarmijosa/"]',
    ) as HTMLAnchorElement;
    expect(linkedinLink).toBeTruthy();
    expect(linkedinLink.getAttribute('target')).toBe('_blank');
    expect(linkedinLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(linkedinLink.getAttribute('aria-label')).toBeTruthy();

    // Personal website link
    const websiteLink = authorSection!.querySelector(
      'a[href="https://www.danny-armijos.com/"]',
    ) as HTMLAnchorElement;
    expect(websiteLink).toBeTruthy();
    expect(websiteLink.getAttribute('target')).toBe('_blank');
    expect(websiteLink.getAttribute('rel')).toBe('noopener noreferrer');
    expect(websiteLink.getAttribute('aria-label')).toBeTruthy();
  });

  it('allows consented user to open and dismiss data governance review mode without altering consent', async () => {
    const clearConsentSpy = vi.fn();
    const fakeAuth = {
      ready: () => Promise.resolve(),
      user: () => ({ profile: { sub: 'usr-consented', preferred_username: 'ada' } }),
      token: () => 'token',
      login: vi.fn(),
      logout: () => Promise.resolve(),
      hasConsent: () => true,
      clearConsent: clearConsentSpy,
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: fakeAuth },
        provideRouter([{ path: '', component: Shell, children: routes }]),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/devices');

    const shellElement = harness.routeNativeElement!;
    // Initially sheet is not visible for consented user
    expect(shellElement.querySelector('#consent-sheet')).toBeNull();

    // Click data governance review trigger in footer
    const reviewBtn = shellElement.querySelector('.footer-gov-btn') as HTMLButtonElement;
    expect(reviewBtn).toBeTruthy();
    reviewBtn.click();
    await harness.fixture.whenStable();

    // Sheet is now visible
    const sheet = shellElement.querySelector('#consent-sheet');
    expect(sheet).toBeTruthy();

    // Verified active consent badge is displayed
    const statusBadge = sheet?.querySelector('.stitch-consent-status-badge');
    expect(statusBadge).toBeTruthy();
    expect(statusBadge?.textContent).toMatch(
      /Active Data Processing Consent Verified|Consentimiento Activo de Tratamiento de Datos Verificado/,
    );

    // Close button is present instead of gating checkbox/accept button
    const closeBtn = sheet?.querySelector('#consent-close-btn') as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    expect(sheet?.querySelector('#consent-accept-check')).toBeNull();
    expect(sheet?.querySelector('#consent-accept-btn')).toBeNull();

    // Clicking Close dismisses sheet
    closeBtn.click();
    await harness.fixture.whenStable();

    expect(shellElement.querySelector('#consent-sheet')).toBeNull();
    expect(clearConsentSpy).not.toHaveBeenCalled();

    // Test backdrop click dismissal in review mode
    reviewBtn.click();
    await harness.fixture.whenStable();
    expect(shellElement.querySelector('#consent-sheet')).toBeTruthy();

    const backdrop = shellElement.querySelector('#consent-backdrop') as HTMLElement;
    expect(backdrop).toBeTruthy();
    backdrop.click();
    await harness.fixture.whenStable();

    expect(shellElement.querySelector('#consent-sheet')).toBeNull();
    expect(clearConsentSpy).not.toHaveBeenCalled();
  });
});
