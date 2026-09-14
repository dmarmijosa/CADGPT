import { Component } from '@angular/core';

const README_URL = 'https://github.com/dmarmijosa/CADGPT#readme';
const SECURITY_URL = 'https://github.com/dmarmijosa/CADGPT/blob/main/SECURITY.md';

/** Public informational page (spec dashboard-routing: public route). */
@Component({
  selector: 'app-about-page',
  templateUrl: './about.html',
})
export class AboutPage {
  readonly readmeUrl = README_URL;
  readonly securityUrl = SECURITY_URL;
}
