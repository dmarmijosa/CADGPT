import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n';

/** Public Privacy Policy page (no auth required). */
@Component({
  selector: 'app-privacy-page',
  imports: [TranslatePipe],
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class PrivacyPage {
  readonly repoUrl = 'https://github.com/dmarmijosa/CADGPT';
  readonly securityEmail = 'security@cadengine.dev';
}
