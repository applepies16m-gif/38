import { test, expect, Page, APIRequestContext } from '@playwright/test';

// Produces the storyboard screenshots used in Phase2.md.
//
// It is not a test of behaviour, so it is skipped in a normal test
// run. To (re)make the screenshots, from the my-app folder:
//
//   PowerShell:      $env:STORYBOARD = "1"; npx playwright test storyboard
//   Command Prompt:  set STORYBOARD=1 && npx playwright test storyboard
//
// It fills the empty test database with a small example (a Super
// Admin, a Group Admin, two users, two groups, some requests and
// messages), then visits each page as the right kind of user and
// saves a picture of it to docs/storyboards.
test.skip(!process.env['STORYBOARD'], 'Only runs when STORYBOARD=1 is set.');
test.describe.configure({ mode: 'serial' });

const API = 'http://localhost:3100/api';
const PASSWORD = 'Testing123';
const SHOTS = 'docs/storyboards';
const ids: Record<string, string> = {};

async function post(request: APIRequestContext, route: string, data: object, asUser?: string) {
  const response = await request.post(API + route, {
    data,
    headers: asUser ? { 'X-User-Id': asUser } : {},
  });
  return response.status() === 204 ? null : response.json();
}

async function put(request: APIRequestContext, route: string, data: object, asUser?: string) {
  await request.put(API + route, { data, headers: asUser ? { 'X-User-Id': asUser } : {} });
}

async function logIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In' }).click();
  await page.waitForURL(/\/(chat|admin)/);
}

async function shot(page: Page, name: string): Promise<void> {
  // Let the "ease in" animations finish, so nothing is half faded.
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test.use({ viewport: { width: 1280, height: 800 } });

test('first-time setup, login and register screens', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveURL(/\/bootstrap/);
  await shot(page, '01-first-time-setup');
});

test('example data is created', async ({ request }) => {
  const person = (username: string, firstName: string, lastName: string, dateOfBirth: string) => ({
    username,
    password: PASSWORD,
    firstName,
    lastName,
    email: `${username}@example.com`,
    dateOfBirth,
  });

  ids['super'] = (
    await post(request, '/bootstrap', person('super', 'Sam', 'Super', '1985-01-15'))
  ).id;
  ids['grace'] = (
    await post(request, '/users', person('groupadmin', 'Grace', 'Admin', '1990-06-20'))
  ).id;
  ids['gary'] = (
    await post(request, '/users', person('groupadmin2', 'Gary', 'Admin', '1992-09-05'))
  ).id;
  ids['mia'] = (await post(request, '/users', person('member', 'Mia', 'Member', '2000-03-10'))).id;
  ids['nick'] = (
    await post(request, '/users', person('newuser', 'Nick', 'Newman', '2010-11-30'))
  ).id;
  ids['oscar'] = (
    await post(request, '/users', person('oscar', 'Oscar', 'Other', '1998-02-02'))
  ).id;

  ids['study'] = (
    await post(
      request,
      '/groups',
      {
        title: 'Study Group',
        description: 'Help with coursework and exam prep.',
        adminIds: [ids['grace'], ids['gary']],
      },
      ids['super'],
    )
  ).id;
  ids['gaming'] = (
    await post(
      request,
      '/groups',
      {
        title: 'Gaming Lounge',
        description: 'Talk about games. Adults only.',
        ageLimit: 18,
        adminIds: [ids['gary']],
        theme: '#dbeafe',
      },
      ids['super'],
    )
  ).id;
  await post(request, '/channels', { name: 'exam-prep', groupId: ids['study'] }, ids['grace']);

  // Mia and Oscar join the Study Group (request, then approval).
  for (const who of ['mia', 'oscar']) {
    const joinRequest = await post(
      request,
      '/join-requests',
      { userId: ids[who], groupId: ids['study'] },
      ids[who],
    );
    await put(request, '/join-requests/' + joinRequest.id, { status: 'approved' }, ids['grace']);
  }
  // Things waiting for someone to decide.
  await post(
    request,
    '/join-requests',
    { userId: ids['nick'], groupId: ids['study'] },
    ids['nick'],
  );
  await post(
    request,
    '/group-requests',
    {
      requestedBy: ids['nick'],
      proposedTitle: 'group1',
      proposedDescription: 'A group for first-year students.',
      proposedAgeLimit: 15,
    },
    ids['nick'],
  );
  await post(
    request,
    '/ban-requests',
    {
      requestedBy: ids['mia'],
      targetUserId: ids['oscar'],
      groupId: ids['study'],
      action: 'remove',
      reason: 'Keeps posting off-topic links.',
    },
    ids['mia'],
  );
  await post(
    request,
    '/ban-requests',
    {
      requestedBy: ids['grace'],
      targetUserId: ids['gary'],
      groupId: ids['study'],
      action: 'remove',
      reason: 'No longer active as an admin.',
    },
    ids['grace'],
  );
  await post(
    request,
    '/reports',
    {
      reporterId: ids['mia'],
      reportedUserId: ids['oscar'],
      groupId: ids['study'],
      reason: 'Rude to other members.',
      messageText: 'nobody asked you',
    },
    ids['mia'],
  );
  await post(
    request,
    '/notifications',
    {
      sentBy: ids['super'],
      message: 'Welcome to Fabulari. Maintenance is planned for Friday at 9pm.',
    },
    ids['super'],
  );
  await post(
    request,
    '/notifications',
    {
      sentBy: ids['super'],
      message: 'Your group request is being reviewed.',
      recipientId: ids['nick'],
    },
    ids['super'],
  );
  await put(
    request,
    '/users/' + ids['mia'],
    { appearance: { textScale: 100, hue: 221 } },
    ids['mia'],
  );
});

test('public screens', async ({ page }) => {
  await page.goto('/login');
  await shot(page, '02-login');
  await page.goto('/register');
  await shot(page, '03-register');
});

test('a brand-new user', async ({ page }) => {
  await logIn(page, 'newuser');
  await expect(page.getByText('not in any groups yet')).toBeVisible();
  await shot(page, '04-chat-new-user-no-groups');
  await page.goto('/browse-groups');
  await expect(page.getByRole('heading', { name: 'Gaming Lounge' })).toBeVisible();
  await shot(page, '05-browse-groups');
  await page.goto('/group-request');
  await expect(page.getByText('group1')).toBeVisible();
  await shot(page, '06-group-request');
  await page.goto('/notifications');
  await expect(page.getByText('Maintenance is planned')).toBeVisible();
  await shot(page, '07-notifications');
});

test('a member chatting', async ({ page, browser }) => {
  // Oscar and Grace say something first, in windows of their own.
  for (const [username, text] of [
    ['oscar', 'Has anyone started the assignment?'],
    ['groupadmin', 'Yes. The spec is pinned in exam-prep.'],
  ]) {
    const context = await browser.newContext();
    const other = await context.newPage();
    await logIn(other, username);
    await other.getByRole('button', { name: '# general' }).first().click();
    await other.getByLabel('Write a message').fill(text);
    await other.getByRole('button', { name: 'Send' }).click();
    await expect(other.getByRole('log').getByText(text)).toBeVisible();
    await context.close();
  }

  await logIn(page, 'member');
  await page.getByRole('button', { name: '# general' }).click();
  await page.getByLabel('Write a message').fill('Thanks, found it!');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('log').getByText('Thanks, found it!')).toBeVisible();
  await shot(page, '08-chat-member');

  // The same screen at tablet width, where the columns stack.
  await page.setViewportSize({ width: 768, height: 1024 });
  await shot(page, '09-chat-tablet-width');
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await shot(page, '10-profile');

  // The same page with the user's own colour and size chosen.
  await page.getByLabel('Colour').fill('150');
  await page.getByLabel(/Size/).fill('110');
  await shot(page, '11-profile-personal-appearance');
});

test('a Group Admin', async ({ page }) => {
  await logIn(page, 'groupadmin');
  await page.goto('/group-admin');
  await expect(page.getByRole('heading', { name: /Members/ })).toBeVisible();
  await shot(page, '12-group-admin');
});

test('the Super Admin', async ({ page }) => {
  await logIn(page, 'super');
  await expect(page.getByText('Admin Control Panel')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'User Reports' })).toBeVisible();
  await shot(page, '13-admin-panel');
  await page.goto('/audit-log');
  await expect(page.getByRole('heading', { name: /Admin Actions/ })).toBeVisible();
  await shot(page, '14-audit-log');
});
