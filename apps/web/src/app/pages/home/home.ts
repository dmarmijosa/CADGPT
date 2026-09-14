import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Public landing page (spec dashboard-routing: public route). Full
 * design-system content lands in slice 9; this is the routing-era stub.
 */
@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  templateUrl: './home.html',
})
export class HomePage {
  readonly auth = inject(AuthService);

  signIn(): void {
    this.auth.login('/devices');
  }
}
