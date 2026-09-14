import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/** App shell: header, persistent left rail nav, `<router-outlet>`, footer. */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  signIn(): void {
    this.auth.login(this.router.url);
  }

  signOut(): void {
    void this.auth.logout();
  }
}
