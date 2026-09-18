import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { SupportPage } from './support';
import { TranslationService } from '../../core/i18n';

describe('SupportPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'support', component: SupportPage }]),
        provideHttpClient(),
        TranslationService,
      ],
    });
  });

  it('renders the support page title', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support', SupportPage);
    const h1 = harness.routeNativeElement!.querySelector('h1');
    expect(h1?.textContent?.trim()).toBeTruthy();
  });

  it('renders both the channels and FAQ panels', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support', SupportPage);
    const panels = harness.routeNativeElement!.querySelectorAll('.panel');
    expect(panels.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the GitHub issues link', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/support', SupportPage);
    const links = harness.routeNativeElement!.querySelectorAll('a[href*="github.com"]');
    expect(links.length).toBeGreaterThanOrEqual(1);
  });
});
