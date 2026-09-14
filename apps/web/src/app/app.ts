import { Component } from '@angular/core';
import { Shell } from './layout/shell/shell';

/** Thin root host: all layout and routing live in `Shell` / `app.routes.ts`. */
@Component({
  selector: 'app-root',
  imports: [Shell],
  template: '<app-shell />',
})
export class App {}
