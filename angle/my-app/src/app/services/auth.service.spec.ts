import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';
import { User } from '../models/user.model';

// A stand-in for the real socket, which would try to connect to
// the server. It only records what was emitted.
class FakeSocketService {
  emitted: string[] = [];
  identifiedAs: string[] = [];
  getSocket() {
    return {
      emit: (eventName: string, data?: { userId: string }) => {
        this.emitted.push(eventName);
        if (eventName === 'identify' && data) {
          this.identifiedAs.push(data.userId);
        }
      },
      // The real socket calls this back when it connects; the fake
      // never connects, so there is nothing to do.
      on: () => {},
    };
  }
}

const sampleUser: User = {
  id: 'u1',
  username: 'alice',
  password: 'should-never-be-stored',
  displayName: 'Alice',
  email: 'alice@example.com',
  role: 'user',
  online: true,
  groupIds: ['g1'],
  bannedFromGroupIds: [],
  isSystemBanned: false,
  appearance: { textScale: 100, hue: 300 },
};

// AuthService remembers who is logged in, in the browser's
// localStorage.
describe('AuthService', () => {
  let service: AuthService;
  let socket: FakeSocketService;

  beforeEach(() => {
    localStorage.clear();
    socket = new FakeSocketService();
    TestBed.configureTestingModule({
      providers: [{ provide: SocketService, useValue: socket }],
    });
    service = TestBed.inject(AuthService);
  });

  it('has nobody logged in to begin with', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
  });

  it('remembers the user after login', () => {
    service.login(sampleUser);
    expect(service.isLoggedIn()).toBe(true);
    expect(service.getCurrentUser()?.username).toBe('alice');
    expect(service.getCurrentUser()?.groupIds).toEqual(['g1']);
  });

  it('never stores the password', () => {
    service.login(sampleUser);
    expect('password' in (service.getCurrentUser() as object)).toBe(false);
    expect(localStorage.getItem('fabulari_currentUser')).not.toContain('should-never-be-stored');
  });

  it("applies the user's chosen colour at login and removes it at logout", () => {
    service.login(sampleUser);
    expect(document.documentElement.style.getPropertyValue('--chrome-blue')).toContain('hsl(300');
    service.logout();
    expect(document.documentElement.style.getPropertyValue('--chrome-blue')).toBe('');
  });

  it('tells the server who the tab belongs to at login, so the user shows as online', () => {
    expect(socket.identifiedAs).toEqual([]);
    service.login(sampleUser);
    expect(socket.identifiedAs).toEqual(['u1']);
  });

  it('forgets the user at logout and tells the server the tab is signed out', () => {
    service.login(sampleUser);
    service.logout();
    expect(service.isLoggedIn()).toBe(false);
    expect(service.getCurrentUser()).toBeNull();
    expect(socket.emitted).toContain('signOut');
  });
});
