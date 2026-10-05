import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { actorInterceptor } from './interceptors/actor.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Every HTTP request passes through actorInterceptor, which adds
    // the logged-in user's id for the server's audit log.
    provideHttpClient(withInterceptors([actorInterceptor])),
  ],
};
