import { TestBed } from '@angular/core/testing';
import { AboutPage } from './about';

describe('AboutPage (spec dashboard-routing: public route)', () => {
  it('renders compatibility and security content without an active session', () => {
    TestBed.configureTestingModule({});

    const fixture = TestBed.createComponent(AboutPage);
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('h1')?.textContent).toContain('About');
    expect(root.querySelector('table.data')).toBeTruthy();
    expect(root.textContent).toContain('experimental alpha');
  });
});
