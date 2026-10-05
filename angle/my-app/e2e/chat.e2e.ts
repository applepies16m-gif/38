import { test, expect, Page } from '@playwright/test';

// End-to-end test: one journey through the real app in a real
// browser, from an empty database to a chat message.
//
// The steps build on each other (the user created in step 2 logs
// in during step 4), so they run in order and stop at the first
// failure.
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'Testing123';

async function logIn(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
}

test('1. an empty system asks for the first Super Admin to be created', async ({ page }) => {
  await page.goto('/login');
  // With no accounts yet, the login page sends you to first-time setup.
  await expect(page).toHaveURL(/\/bootstrap/);

  await page.getByLabel('First Name').fill('Sam');
  await page.getByLabel('Last Name').fill('Super');
  await page.getByLabel('Username').fill('super');
  await page.getByLabel('Email').fill('super@example.com');
  await page.getByLabel('Date of Birth').fill('1985-01-15');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create Super Admin' }).click();

  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText('Admin Control Panel')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'super', exact: true })).toBeVisible();
});

test('2. a visitor registers and arrives in chat with no groups yet', async ({ page }) => {
  await page.goto('/register');

  // A date of birth in year 0112 is refused before anything is sent.
  await page.getByLabel('First Name').fill('Alice');
  await page.getByLabel('Last Name').fill('Tester');
  await page.getByLabel('Username').fill('Alice');
  await page.getByLabel('Email').fill('alice@example.com');
  await page.getByLabel('Date of Birth').fill('0112-02-12');
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirm Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.getByRole('alert')).toContainText('Date of birth');

  await page.getByLabel('Date of Birth').fill('1999-03-10');
  await page.getByRole('button', { name: 'Create Account' }).click();

  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByText('not in any groups yet')).toBeVisible();
});

test('3. a wrong password is refused with a message', async ({ page }) => {
  await logIn(page, 'alice', 'WrongPassword1');
  await expect(page.getByRole('alert')).toContainText('Incorrect username or password');
  await expect(page).toHaveURL(/\/login/);
});

test('4. the Super Admin creates a group and makes the new user its admin', async ({ page }) => {
  await logIn(page, 'super');
  await expect(page).toHaveURL(/\/admin/);

  await page.getByLabel('New group name').fill('E2E Group');
  await page.getByLabel('Group admin').selectOption({ label: 'Alice Tester (alice)' });
  await page.getByRole('button', { name: 'Create Group' }).click();

  // Alice's row in the Users table now shows her as a Group Admin
  // of the new group, without reloading the page.
  const aliceRow = page.getByRole('row').filter({ hasText: 'Alice Tester' }).first();
  await expect(aliceRow).toContainText('group_admin');
  await expect(aliceRow).toContainText('E2E Group');

  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('5. the user sends a message in the group, sees it, and deletes it', async ({ page }) => {
  // Logging in with capitals works: usernames are not case-sensitive.
  await logIn(page, 'ALICE');
  await expect(page).toHaveURL(/\/chat/);
  await expect(page.getByRole('heading', { name: 'E2E Group' })).toBeVisible();

  await page.getByRole('button', { name: '# general' }).click();
  await expect(page.getByRole('heading', { name: '# general' })).toBeVisible();
  // Online Now lists the group's members; Alice is online.
  await expect(page.locator('.user-row').filter({ hasText: 'Alice Tester' })).toContainText('online');

  const text = 'Hello from the end-to-end test';
  await page.getByLabel('Write a message').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();

  const thread = page.getByRole('log');
  await expect(thread.getByText(text)).toBeVisible();

  // The message was stored: it is still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: '# general' }).click();
  await expect(page.getByRole('log').getByText(text)).toBeVisible();

  // Deleting your own message removes it. The app asks first.
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('log').getByRole('button', { name: 'delete' }).click();
  await expect(page.getByRole('log').getByText(text)).toHaveCount(0);
});

test('6. a member cannot open the Super Admin\'s pages', async ({ page }) => {
  await logIn(page, 'alice');
  await expect(page).toHaveURL(/\/chat/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/chat/);
  await page.goto('/audit-log');
  await expect(page).toHaveURL(/\/chat/);
});
