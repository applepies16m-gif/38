import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// An interceptor sees every HTTP request the app makes before it
// leaves the browser. This one adds the logged-in user's id as an
// X-User-Id header, so the server can record who carried out an
// admin action in the audit log without every service having to
// pass the id along itself.
//
// The header is only a claim: there is no login token, so the
// server cannot prove the id is genuine.
export const actorInterceptor: HttpInterceptorFn = (request, next) => {
  const currentUser = inject(AuthService).getCurrentUser();
  if (!currentUser) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { 'X-User-Id': currentUser.id } }));
};
