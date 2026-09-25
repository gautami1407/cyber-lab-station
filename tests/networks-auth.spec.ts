import { expect, test, type Page } from '@playwright/test';

const FRONTEND_BASE = 'http://localhost:5173';

async function registerUser(page: Page) {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  const username = `pw${timestamp}`;
  const email = `pw${timestamp}@test.local`;
  const password = 'UniversityLab!2026';

  await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Login' })).toBeVisible();

  const regUsername = page.locator('#reg-username');
  const regEmail = page.locator('#reg-email');
  const regPassword = page.locator('#reg-password');
  const regConfirm = page.locator('#reg-confirm');

  await regUsername.fill(username);
  await regEmail.fill(email);
  await regPassword.fill(password);
  await regConfirm.fill(password);

  await expect(regUsername).toHaveValue(username);
  await expect(regEmail).toHaveValue(email);
  await expect(regPassword).toHaveValue(password);
  await expect(regConfirm).toHaveValue(password);

  const registerResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  await registerResponse;
  await expect(page.getByText('Registration succeeded')).toBeVisible({ timeout: 15000 });

  return { username, email, password };
}

async function loginUser(page: Page, username: string, password: string) {
  await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  await page.getByRole('tab', { name: 'Login' }).click();
  await expect(page.locator('#login-id')).toBeVisible();
  const loginId = page.locator('#login-id');
  const loginPassword = page.locator('#login-password');

  await loginId.fill(username);
  await loginPassword.fill(password);
  await expect(loginId).toHaveValue(username);
  await expect(loginPassword).toHaveValue(password);

  const loginResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Login' }).click();
  await loginResponse;
  await expect(page.getByText('Signed in')).toBeVisible({ timeout: 15000 });
}

test.describe('Authentication and networks access', () => {
  test('should show an auth prompt for unauthenticated users', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/networks`);
    await expect(page.getByRole('heading', { name: 'Authentication Required' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Register / Login' })).toBeVisible();
  });

  test('should register a new account and keep the user signed in', async ({ page }) => {
    const credentials = await registerUser(page);
    await page.goto(`${FRONTEND_BASE}/dashboard`);
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText(credentials.username)).toBeVisible();
  });

  test('should log in with an existing account and reach the networks page', async ({ page }) => {
    const credentials = await registerUser(page);
    await loginUser(page, credentials.username, credentials.password);
    await page.goto(`${FRONTEND_BASE}/networks`);
    await expect(page.getByRole('heading', { name: 'Networks & Devices' })).toBeVisible();
    await expect(page.getByText('Local interfaces')).toBeVisible();
  });
});
