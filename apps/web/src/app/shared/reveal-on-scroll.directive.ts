import {
  DestroyRef,
  Directive,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

/**
 * One quiet scroll reveal, applied at section granularity across the home
 * page (design: home redesign) rather than as per-card choreography. A host
 * element starts fully visible; only once the browser confirms it can
 * observe intersection (and the visitor hasn't asked for reduced motion)
 * does it opt the element into a pending, transitions-in-on-scroll state —
 * so a visitor with JS disabled, an old browser without
 * `IntersectionObserver`, or `prefers-reduced-motion: reduce` always sees
 * the section's real content immediately, never a hidden/stuck state.
 */
@Directive({ selector: '[appRevealOnScroll]' })
export class RevealOnScrollDirective {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (!isPlatformBrowser(this.platformId)) return;
      if (typeof IntersectionObserver !== 'function') return;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

      const element = this.host.nativeElement;
      element.classList.add('reveal-pending');

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          element.classList.add('is-visible');
          observer.disconnect();
        },
        { threshold: 0.2, rootMargin: '0px 0px -10% 0px' },
      );
      observer.observe(element);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
