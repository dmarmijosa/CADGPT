import { Component, input } from '@angular/core';

/**
 * Guarded stub for the post-pairing MCP client onboarding step
 * (design "Onboarding"; spec mcp-client-onboarding). `device` binds from the
 * `?device=` query param via `withComponentInputBinding()`. Full Claude/
 * ChatGPT connection instructions land in a later slice.
 */
@Component({
  selector: 'app-connect-page',
  templateUrl: './connect.html',
})
export class ConnectPage {
  readonly device = input<string>('');
}
