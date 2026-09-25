import { chromium } from 'playwright';

const FRONTEND_BASE = 'http://localhost:5173';

async function expectValue(locator, value) {
  const actual = await locator.inputValue();
  if (actual !== value) {
    throw new Error(`Expected value ${value}, got ${actual}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err.message));
  page.on('request', (req) => {
    if (req.url().includes('/api/auth')) console.log('REQUEST', req.method(), req.url(), req.postData());
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/auth')) console.log('RESPONSE', res.status(), res.url());
  });

  const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  const username = `pw${timestamp}`;
  const email = `pw${timestamp}@test.local`;
  const password = 'UniversityLab!2026';

  await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  await page.getByRole('button', { name: 'Create account' }).waitFor();

  const regUsername = page.locator('#reg-username');
  const regEmail = page.locator('#reg-email');
  const regPassword = page.locator('#reg-password');
  const regConfirm = page.locator('#reg-confirm');

  await regUsername.fill(username);
  await regEmail.fill(email);
  await regPassword.fill(password);
  await regConfirm.fill(password);

  await expectValue(regUsername, username);
  await expectValue(regEmail, email);
  await expectValue(regPassword, password);
  await expectValue(regConfirm, password);

  const registerResponse = page.waitForResponse(
    (response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create account' }).click();
  const response = await registerResponse;
  console.log('REGISTER_RESPONSE_STATUS', response.status());
  await page.waitForTimeout(2000);
  console.log('FINAL_BODY_SNIPPET', await page.locator('body').innerText());
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
