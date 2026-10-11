import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { notifyParentIfSilentCallback } from './app/core/auth/silent-callback';

// Inside the hidden silent sign-in iframe, only report back to the parent tab.
if (!notifyParentIfSilentCallback()) {
  bootstrapApplication(App, appConfig).catch((err) => console.error(err));
}
