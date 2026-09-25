const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err.message));
  page.on('request', (req) => {
    if (req.url().includes('/api/auth')) {
      console.log('REQUEST', req.method(), req.url(), req.postData());
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/auth')) {
      console.log('RESPONSE', res.status(), res.url());
    }
  });

  await page.goto('http://localhost:8081/projects/authentication');
  await page.locator('#reg-username').fill('userabc');
  await page.locator('#reg-email').fill('userabc@example.com');
  await page.locator('#reg-password').fill('StrongPass123!');
  await page.locator('#reg-confirm').fill('StrongPass123!');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForTimeout(3000);
  console.log('done');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
