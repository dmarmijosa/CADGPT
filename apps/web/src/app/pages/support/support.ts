import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n';

/** Public Support page (no auth required). */
@Component({
  selector: 'app-support-page',
  imports: [TranslatePipe],
  templateUrl: './support.html',
  styleUrl: './support.css',
})
export class SupportPage {
  readonly githubIssuesUrl = 'https://github.com/dmarmijosa/CADGPT/issues/new/choose';
  readonly securityAdvisoryUrl = 'https://github.com/dmarmijosa/CADGPT/security/advisories/new';
  readonly securityEmail = 'security@cadengine.dev';
}
