import { Component } from '@angular/core';
import { TranslatePipe } from '../../core/i18n';

/** Public Terms of Service page (no auth required). */
@Component({
  selector: 'app-terms-page',
  imports: [TranslatePipe],
  templateUrl: './terms.html',
  styleUrl: './terms.css',
})
export class TermsPage {}
