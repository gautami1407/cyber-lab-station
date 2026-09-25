import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/projects/authentication');

  const info = await page.locator('button:has-text("Create account")').evaluate((el) => ({
    tag: el.tagName,
    type: el.getAttribute('type'),
    form: !!el.closest('form'),
    html: el.outerHTML.slice(0, 300),
    text: el.textContent,
  }));

  console.log('BUTTON_INFO', JSON.stringify(info, null, 2));

  const username = page.locator('#reg-username');
  const email = page.locator('#reg-email');
  const password = page.locator('#reg-password');
  const confirm = page.locator('#reg-confirm');

  await username.fill('abc123');
  await email.fill('abc123@test.local');
  await password.fill('StrongPass123!');
  await confirm.fill('StrongPass123!');

  console.log('FIELD_VALUES', JSON.stringify({
    username: await username.inputValue(),
    email: await email.inputValue(),
    password: await password.inputValue(),
    confirm: await confirm.inputValue(),
  }, null, 2));

  const beforeClick = await page.locator('button:has-text("Create account")').evaluate((el) => {
    const form = el.closest('form');
    return {
      type: el.getAttribute('type'),
      formPresent: !!form,
      formData: form ? Object.fromEntries(new FormData(form).entries()) : null,
    };
  });
  console.log('BEFORE_CLICK', JSON.stringify(beforeClick, null, 2));

  const requestPromise = page.waitForRequest((req) => req.url().includes('/api/auth/register') && req.method() === 'POST');
  await page.locator('button:has-text("Create account")').click();
  const req = await requestPromise;
  console.log('REQUEST_SEEN', req.method(), req.url(), req.postData());
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
