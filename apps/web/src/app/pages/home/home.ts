import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExplodedPlug } from '../../features/exploded/exploded-plug';
import { AuthService } from '../../core/auth/auth.service';

const RELEASES_URL = 'https://github.com/dmarmijosa/CADGPT/releases';

/**
 * Public landing page (spec dashboard-routing: public route). Leads with a
 * scroll-driven exploded view of a spark plug (`ExplodedPlug`) as the hero,
 * then explains the three-step connection flow, today's capabilities, and
 * the security posture, for a visitor with no active session.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink, ExplodedPlug],
  templateUrl: './home.html',
})
export class HomePage {
  readonly auth = inject(AuthService);
  readonly releasesUrl = RELEASES_URL;

  signIn(): void {
    this.auth.login('/designs');
  }
}
