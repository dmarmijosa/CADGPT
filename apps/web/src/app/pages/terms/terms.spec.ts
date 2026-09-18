import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { TermsPage } from './terms';
import { TranslationService } from '../../core/i18n';

describe('TermsPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'terms', component: TermsPage }]),
        provideHttpClient(),
        TranslationService,
      ],
    });
  });

  it('renders the terms of service page title', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/terms', TermsPage);
    const h1 = harness.routeNativeElement!.querySelector('h1');
    expect(h1?.textContent?.trim()).toBeTruthy();
  });

  it('renders at least 4 panel sections', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/terms', TermsPage);
    const panels = harness.routeNativeElement!.querySelectorAll('.panel');
    expect(panels.length).toBeGreaterThanOrEqual(4);
  });
});
