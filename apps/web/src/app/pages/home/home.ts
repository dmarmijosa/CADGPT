import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExplodedPlug } from '../../features/exploded/exploded-plug';
import { AuthService } from '../../core/auth/auth.service';
import { RevealOnScrollDirective } from '../../shared/reveal-on-scroll.directive';
import { TranslatePipe } from '../../core/i18n';

const RELEASES_URL = 'https://github.com/dmarmijosa/CADGPT/releases';

/**
 * Public landing page (spec dashboard-routing: public route). Leads with a
 * scroll-driven exploded view of a spark plug (`ExplodedPlug`) as the hero,
 * then makes the case for the product editorially: what it is, the
 * install → pair → connect path, what each CAD backend can do today, and
 * what never leaves the visitor's machine.
 *
 * Every call to action here is auth-reactive: a visitor with no session gets
 * "Sign in" (`auth.login`); a visitor who already holds one gets a plain
 * `routerLink` to their dashboard instead, so clicking it never re-triggers
 * an OIDC redirect for someone who is already signed in.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ExplodedPlug, RevealOnScrollDirective, TranslatePipe],
  templateUrl: './home.html',
})
export class HomePage {
  readonly auth = inject(AuthService);
  readonly releasesUrl = RELEASES_URL;

  signIn(): void {
    this.auth.login('/designs');
  }
}
