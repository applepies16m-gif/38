import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BrowseGroupsComponent } from './browse-groups.component';
import { GroupService } from '../../services/group.service';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { Group, JoinRequest } from '../../models/group.model';
import { User } from '../../models/user.model';

// A date of birth for someone this many years old today.
function bornYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate() - 1 || 1)}`;
}

const group = (id: string, title: string, ageLimit = 0): Group => ({
  id,
  title,
  description: title + ' description',
  ageLimit,
  adminIds: ['admin'],
  channelIds: [],
});

const user = (extra: Partial<User> = {}): User => ({
  id: 'me',
  username: 'me',
  displayName: 'Me',
  email: 'me@example.com',
  role: 'user',
  online: true,
  groupIds: [],
  bannedFromGroupIds: [],
  isSystemBanned: false,
  dateOfBirth: bornYearsAgo(30),
  ...extra,
});

// The Browse Groups page decides what each group's button says.
// The three services are replaced by stand-ins that return fixed
// data, so no server is needed.
describe('BrowseGroupsComponent', () => {
  let fixture: ComponentFixture<BrowseGroupsComponent>;
  let component: BrowseGroupsComponent;
  let submitted: Partial<JoinRequest>[];

  // Builds the page as it would look for the given user.
  async function openPageAs(
    currentUser: User,
    groups: Group[],
    requests: Partial<JoinRequest>[] = [],
  ): Promise<void> {
    submitted = [];
    await TestBed.configureTestingModule({
      imports: [BrowseGroupsComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { getCurrentUser: () => currentUser, login: () => {}, logout: () => {} },
        },
        { provide: UserService, useValue: { getUsers: () => of([currentUser]) } },
        {
          provide: GroupService,
          useValue: {
            getGroups: () => of(groups),
            getJoinRequests: () => of(requests),
            submitJoinRequest: (request: Partial<JoinRequest>) => {
              submitted.push(request);
              return of({ ...request, id: 'new', status: 'pending' });
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BrowseGroupsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lets a user request a group they have no connection with', async () => {
    await openPageAs(user(), [group('g1', 'Chess')]);
    const status = component.joinStatus(group('g1', 'Chess'));
    expect(status.canRequest).toBe(true);
    expect(status.label).toBe('Request to Join');
  });

  it('shows "Member" for a group the user is already in', async () => {
    await openPageAs(user({ groupIds: ['g1'] }), [group('g1', 'Chess')]);
    expect(component.joinStatus(group('g1', 'Chess'))).toEqual({
      label: 'Member',
      canRequest: false,
      reason: '',
    });
  });

  it('shows "Requested" for a pending request read from the server', async () => {
    await openPageAs(
      user(),
      [group('g1', 'Chess')],
      [{ userId: 'me', groupId: 'g1', status: 'pending' }],
    );
    expect(component.joinStatus(group('g1', 'Chess')).label).toBe('Requested');
    expect(component.joinStatus(group('g1', 'Chess')).canRequest).toBe(false);
  });

  it("does not count someone else's request, or one already rejected", async () => {
    await openPageAs(
      user(),
      [group('g1', 'Chess')],
      [
        { userId: 'other', groupId: 'g1', status: 'pending' },
        { userId: 'me', groupId: 'g1', status: 'rejected' },
      ],
    );
    expect(component.joinStatus(group('g1', 'Chess')).canRequest).toBe(true);
  });

  it('shows "Banned" for a group the user is banned from', async () => {
    await openPageAs(user({ bannedFromGroupIds: ['g1'] }), [group('g1', 'Chess')]);
    const status = component.joinStatus(group('g1', 'Chess'));
    expect(status.label).toBe('Banned');
    expect(status.canRequest).toBe(false);
  });

  it("blocks a user under the group's age limit, and says the age needed", async () => {
    await openPageAs(user({ dateOfBirth: bornYearsAgo(12) }), [group('g1', 'Adults', 18)]);
    const status = component.joinStatus(group('g1', 'Adults', 18));
    expect(status.canRequest).toBe(false);
    expect(status.reason).toContain('18');
  });

  it('blocks a user with no date of birth from an age-limited group only', async () => {
    await openPageAs(user({ dateOfBirth: undefined }), [
      group('g1', 'Adults', 18),
      group('g2', 'Open'),
    ]);
    expect(component.joinStatus(group('g1', 'Adults', 18)).canRequest).toBe(false);
    expect(component.joinStatus(group('g1', 'Adults', 18)).reason).toContain('date of birth');
    expect(component.joinStatus(group('g2', 'Open')).canRequest).toBe(true);
  });

  it('sends a join request and then shows the group as requested', async () => {
    await openPageAs(user(), [group('g1', 'Chess')]);
    component.requestToJoin(group('g1', 'Chess'));
    expect(submitted).toEqual([{ userId: 'me', groupId: 'g1' }]);
    expect(component.joinStatus(group('g1', 'Chess')).label).toBe('Requested');
  });

  it('draws a panel for each group and disables the button where joining is not allowed', async () => {
    await openPageAs(user({ groupIds: ['g1'] }), [group('g1', 'Chess'), group('g2', 'Go')]);
    const page = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(page.querySelectorAll('.group-row button')) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('Member');
    expect(buttons[0].disabled).toBe(true);
    expect(buttons[1].textContent).toContain('Request to Join');
    expect(buttons[1].disabled).toBe(false);
  });

  it('narrows the list when searching, by title or description', async () => {
    await openPageAs(user(), [group('g1', 'Chess'), group('g2', 'Go'), group('g3', 'Checkers')]);
    component.groupList.search('che');
    expect(component.groupList.filtered().map((g) => g.title)).toEqual(['Chess', 'Checkers']);
    component.groupList.search('go description');
    expect(component.groupList.filtered().map((g) => g.title)).toEqual(['Go']);
  });
});
