import { test, expect, Browser, BrowserContext, Page } from '@playwright/test';
import { resetDatabase } from './reset-database';

// The marker's test plan, carried out step by step in a real
// browser. The plan uses four browser windows (BW1 to BW4), each
// logged in as a different person, and they stay open throughout,
// so this test keeps four separate windows open too.
//
// The section names and step numbers below are the plan's own.
// Where the app deliberately differs from the plan's wording, the
// step says so.
test.describe.configure({ mode: 'serial' });

// The plan gives the password "123". The client's rule (at least 8
// characters with an uppercase letter) refuses that, which the
// test checks, and then a password that passes the rule is used.
const PLAN_PASSWORD = '123';
const PASSWORD = 'Password123';

let bw1: Page; // the Super Admin
let bw2: Page; // user1
let bw3: Page; // user2
let bw4: Page; // user3
const contexts: BrowserContext[] = [];

async function newWindow(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  contexts.push(context);
  return context.newPage();
}

async function logIn(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log In' }).click();
}

// Fills in the Register form. Returns without submitting.
async function fillRegister(
  page: Page,
  username: string,
  first: string,
  last: string,
  dateOfBirth: string,
  password: string,
) {
  await page.goto('/register');
  await page.getByLabel('First Name').fill(first);
  await page.getByLabel('Last Name').fill(last);
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Email').fill(username);
  await page.getByLabel('Date of Birth').fill(dateOfBirth);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm Password').fill(password);
}

test.beforeAll(async ({ browser }) => {
  // "There should be no saved data on the server when the app first starts."
  await resetDatabase();
  bw1 = await newWindow(browser);
  bw2 = await newWindow(browser);
  bw3 = await newWindow(browser);
  bw4 = await newWindow(browser);
});

test.afterAll(async () => {
  for (const context of contexts) {
    await context.close();
  }
});

test('Running the App: the first visitor bootstraps the Super Admin, and it is not offered again', async () => {
  // Steps 2 to 4: the app starts and offers to create the super user.
  await bw1.goto('/');
  await expect(bw1).toHaveURL(/\/bootstrap/);
  await bw1.getByLabel('First Name').fill('Super');
  await bw1.getByLabel('Last Name').fill('Admin');
  await bw1.getByLabel('Username').fill('super');
  await bw1.getByLabel('Email').fill('super@example.com');
  await bw1.getByLabel('Date of Birth').fill('1980-01-01');
  await bw1.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await bw1.getByLabel('Confirm Password').fill(PASSWORD);
  await bw1.getByRole('button', { name: 'Create Super Admin' }).click();
  await expect(bw1).toHaveURL(/\/admin/);

  // Step 5: log out and log in as the super admin; no bootstrap this time.
  await bw1.getByRole('button', { name: 'Log Out' }).click();
  await expect(bw1).toHaveURL(/\/login/);
  await bw1.goto('/bootstrap');
  await bw1.getByLabel('First Name').fill('Second');
  await bw1.getByLabel('Last Name').fill('Attempt');
  await bw1.getByLabel('Username').fill('second');
  await bw1.getByLabel('Email').fill('second@example.com');
  await bw1.getByLabel('Date of Birth').fill('1980-01-01');
  await bw1.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await bw1.getByLabel('Confirm Password').fill(PASSWORD);
  await bw1.getByRole('button', { name: 'Create Super Admin' }).click();
  await expect(bw1.getByRole('alert')).toContainText('already been completed');

  await logIn(bw1, 'super');
  await expect(bw1).toHaveURL(/\/admin/);
});

test('Register a New User (User1): registers, sees a chat interface, and requests "group1" with minimum age 15', async () => {
  // Step 2, as written: password "123" is refused by the password rule.
  await fillRegister(bw2, 'user1@com.au', 'User', 'One', '1971-01-01', PLAN_PASSWORD);
  await bw2.getByRole('button', { name: 'Create Account' }).click();
  await expect(bw2.getByRole('alert')).toContainText('at least 8 characters');

  // Step 2, with a password that meets the rule. The username is
  // the email-style one the plan gives.
  await bw2.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await bw2.getByLabel('Confirm Password').fill(PASSWORD);
  await bw2.getByRole('button', { name: 'Create Account' }).click();

  // Step 3: the screen is arranged around chat.
  await expect(bw2).toHaveURL(/\/chat/);
  await expect(bw2.getByLabel('Write a message')).toBeHidden();
  await expect(bw2.getByText('not in any groups yet')).toBeVisible();

  // Step 4: request a group called "group1", minimum age 15.
  await bw2.getByRole('link', { name: 'Request Group' }).click();
  await bw2.getByLabel(/Group Title/).fill('group1');
  await bw2.getByLabel(/Description/).fill('The first group.');
  await bw2.getByLabel(/Minimum Age/).fill('15');
  await bw2.getByRole('button', { name: 'Submit Request' }).click();
  await expect(bw2.getByRole('status')).toContainText('Request submitted');
  await expect(bw2.getByRole('cell', { name: /group1/ })).toContainText('ages 15+');
  await bw2.goto('/chat');
});

test('Super Admin: creates the group from the request, which makes user1 its Group Admin', async () => {
  await bw1.reload();
  const request = bw1.getByRole('row').filter({ hasText: 'group1' }).filter({ hasText: 'pending' });
  await expect(request).toContainText('15+');
  await expect(request).toContainText('User One');

  // Step 2: create the group from the request.
  await request.getByRole('button', { name: 'approve' }).click();

  // Step 3: user1 is now the group's admin. Approving does this.
  const user1Row = bw1.getByRole('row').filter({ hasText: 'user1@com.au' });
  await expect(user1Row).toContainText('group_admin');
  await expect(user1Row).toContainText('group1');

  // BW2 was open the whole time: the group appears there without a reload.
  await expect(bw2.getByRole('heading', { name: 'group1' })).toBeVisible();
  await expect(bw2.getByRole('button', { name: '# general' })).toBeVisible();
  await expect(bw2.getByRole('link', { name: 'Manage Group' })).toBeVisible();
});

test('Register a new user (User 2): a 16-year-old registers and asks to join the group', async () => {
  await fillRegister(bw3, 'user2@com.au', 'User', 'Two', '2010-10-01', PASSWORD);
  await bw3.getByRole('button', { name: 'Create Account' }).click();
  await expect(bw3).toHaveURL(/\/chat/);

  // Step 3: request to join the new group. 16 meets the limit of 15.
  await bw3.getByRole('link', { name: 'Browse Groups' }).first().click();
  const group = bw3.locator('.panel').filter({ hasText: 'group1' });
  await expect(group).toContainText('Age limit: 15+');
  await group.getByRole('button', { name: 'Request to Join' }).click();
  await expect(group.getByRole('button', { name: 'Requested' })).toBeDisabled();
  await bw3.goto('/chat');
});

test('Register a new user (User 3): an 8-year-old is refused for being under age, then deleted', async () => {
  await fillRegister(bw4, 'user3@com.au', 'User', 'Three', '2018-10-01', PASSWORD);
  await bw4.getByRole('button', { name: 'Create Account' }).click();
  await expect(bw4).toHaveURL(/\/chat/);

  // Step 3: the request to join fails, with the reason shown.
  await bw4.getByRole('link', { name: 'Browse Groups' }).first().click();
  const group = bw4.locator('.panel').filter({ hasText: 'group1' });
  await expect(group.getByRole('button', { name: 'Request to Join' })).toBeDisabled();
  await expect(group).toContainText('You must be 15 or older to join.');

  // Step 4: delete user3. The user deletes their own account.
  await bw4.goto('/profile');
  bw4.once('dialog', (dialog) => dialog.accept());
  await bw4.getByRole('button', { name: 'Delete My Account' }).click();
  await expect(bw4).toHaveURL(/\/login/);

  // The account is gone: it can no longer log in.
  await logIn(bw4, 'user3@com.au');
  await expect(bw4.getByRole('alert')).toContainText('Incorrect username or password');
});

test('Group Admin (User 1): adds a channel and accepts user2 into the group', async () => {
  await bw2.getByRole('link', { name: 'Manage Group' }).click();
  await expect(bw2).toHaveURL(/\/group-admin/);

  // Step 2: add a new channel to the group.
  await bw2.getByLabel('Channel Name').fill('announcements');
  bw2.once('dialog', (dialog) => dialog.accept());
  await bw2.getByRole('button', { name: 'Create Channel' }).click();
  await expect(bw2.getByRole('cell', { name: '# announcements' })).toBeVisible();

  // Step 3: view requests and add user2 to the group.
  const joinRequest = bw2
    .getByRole('row')
    .filter({ hasText: 'User Two' })
    .filter({ hasText: 'approve' });
  await joinRequest.getByRole('button', { name: 'approve' }).click();
  await expect(
    bw2.getByRole('row').filter({ hasText: 'User Two' }).filter({ hasText: 'member' }),
  ).toBeVisible();
});

test('User View (User 2): sees their groups and channels, their profile, and the chat', async () => {
  // Step 2: the group and both channels appeared without a reload.
  await expect(bw3.getByRole('heading', { name: 'group1' })).toBeVisible();
  await expect(bw3.getByRole('button', { name: '# general' })).toBeVisible();
  await expect(bw3.getByRole('button', { name: '# announcements' })).toBeVisible();

  // Step 3: the profile page.
  await bw3.getByRole('link', { name: 'My Profile' }).click();
  await expect(bw3.getByRole('heading', { name: 'Account Details' })).toBeVisible();
  await expect(bw3.getByLabel('Username')).toHaveValue('user2@com.au');
  await bw3.goto('/chat');

  // Step 4: the UI where chats occur. A message really is sent.
  await bw3.getByRole('button', { name: '# general' }).click();
  await bw3.getByLabel('Write a message').fill('Hello from user2');
  await bw3.getByRole('button', { name: 'Send' }).click();
  await expect(bw3.getByRole('log').getByText('Hello from user2')).toBeVisible();
});

test('Group Admin (User 1): promotes user2, who can then administer the group, and user1 is demoted', async () => {
  // Step 1: promote user2 to group admin.
  const user2Row = bw2
    .getByRole('row')
    .filter({ hasText: 'User Two' })
    .filter({ hasText: 'promote' });
  await user2Row.getByRole('button', { name: 'promote' }).click();
  await expect(
    bw2.getByRole('row').filter({ hasText: 'User Two' }).filter({ hasText: 'group admin' }),
  ).toBeVisible();

  // Step 2: user2 can now administer the group the same as user1.
  // The "Manage Group" link appears in BW3 without a reload.
  await bw3.getByRole('link', { name: 'Manage Group' }).click();
  await expect(bw3).toHaveURL(/\/group-admin/);
  await expect(bw3.getByRole('heading', { name: /Members — group1/ })).toBeVisible();
  await expect(bw3.getByRole('heading', { name: /Group Settings — group1/ })).toBeVisible();

  // Step 3: demote user1 to a standard user. User1 steps down
  // themself; one admin cannot demote another directly.
  await bw2
    .getByRole('row')
    .filter({ hasText: 'User One' })
    .getByRole('button', { name: 'step down as admin' })
    .click();

  // User1 is now a standard user, and still a member of the group.
  await bw1.reload();
  const user1Row = bw1.getByRole('row').filter({ hasText: 'user1@com.au' });
  await expect(user1Row.locator('.badge').first()).toHaveText('user');
  await expect(user1Row).toContainText('group1');
  await bw2.goto('/chat');
  await expect(bw2.getByRole('heading', { name: 'group1' })).toBeVisible();
  await expect(bw2.getByRole('link', { name: 'Manage Group' })).toHaveCount(0);
});

test('Super User: the audit log shows what the admins did', async () => {
  await bw1.getByRole('link', { name: 'Audit Log' }).click();
  await expect(bw1).toHaveURL(/\/audit-log/);
  const log = bw1.getByRole('table');
  for (const action of [
    'Group request approved',
    'Group created',
    'Channel created',
    'Join request approved',
    'Admin promoted',
    'Admin removed',
    'User deleted',
  ]) {
    await expect(log.getByRole('cell', { name: action, exact: true }).first()).toBeVisible();
  }
});
