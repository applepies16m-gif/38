import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { actorInterceptor } from './actor.interceptor';
import { AuthService } from '../services/auth.service';

// A stand-in AuthService whose logged-in user the test controls.
class FakeAuthService {
  user: { id: string } | null = null;
  getCurrentUser() {
    return this.user;
  }
}

// The interceptor adds the logged-in user's id to every request,
// which is how the server knows who to record in the audit log.
describe('actorInterceptor', () => {
  let http: HttpClient;
  let server: HttpTestingController;
  let auth: FakeAuthService;

  beforeEach(() => {
    auth = new FakeAuthService();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        provideHttpClient(withInterceptors([actorInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    server.verify();
  });

  it('adds the X-User-Id header when someone is logged in', () => {
    auth.user = { id: 'user-123' };
    http.get('/api/anything').subscribe();
    const request = server.expectOne('/api/anything');
    expect(request.request.headers.get('X-User-Id')).toBe('user-123');
    request.flush({});
  });

  it('adds nothing when nobody is logged in', () => {
    http.get('/api/anything').subscribe();
    const request = server.expectOne('/api/anything');
    expect(request.request.headers.has('X-User-Id')).toBe(false);
    request.flush({});
  });
});
