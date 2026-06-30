import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only intercept /api calls
  if (!req.url.startsWith('/api')) {
    return next(req);
  }

  // The X-PAT header is already set by ApiService, so this interceptor
  // serves as a central place for future cross-cutting concerns
  // (logging, retry logic, etc.)
  return next(req);
};
