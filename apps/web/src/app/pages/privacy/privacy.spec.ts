import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { PrivacyPage } from './privacy';
import { TranslationService } from '../../core/i18n';

describe('PrivacyPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'privacy', component: PrivacyPage }]),
        provideHttpClient(),
        TranslationService,
      ],
    });
  });

  it('renders the privacy policy page title', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/privacy', PrivacyPage);
    const h1 = harness.routeNativeElement!.querySelector('h1');
    expect(h1?.textContent?.trim()).toBeTruthy();
  });

  it('renders the sections as panels', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/privacy', PrivacyPage);
    const panels = harness.routeNativeElement!.querySelectorAll('.panel');
    expect(panels.length).toBeGreaterThanOrEqual(4);
  });
});
