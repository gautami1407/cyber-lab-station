import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE_ERROR', err.message));
  await page.goto('http://localhost:5173/projects/authentication');
  await page.evaluate(() => {
    const btn = document.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => console.log('CLICK_EVENT_LISTENER_FIRED'), { once: true });
    }
  });
  console.log('BEFORE_CLICK', await page.locator('button').first().evaluate((el) => ({ type: el.getAttribute('type'), text: el.textContent })));
  await page.locator('button').first().click();
  await page.waitForTimeout(2000);
  console.log('AFTER_CLICK_DONE');
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
