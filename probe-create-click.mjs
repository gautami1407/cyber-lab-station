import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err.message));
  await page.goto('http://localhost:5173/projects/authentication');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const create = btns.find((b) => b.textContent?.includes('Create account'));
    if (create) {
      create.addEventListener('click', () => console.log('CLICK_LISTENER_CREATE_ACCOUNT'), { once: true });
    }
  });
  const btn = page.getByRole('button', { name: 'Create account' });
  console.log('BUTTON_EXISTS', await btn.count());
  await btn.click();
  await page.waitForTimeout(2000);
  console.log('DONE');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
