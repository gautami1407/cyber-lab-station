import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER_CONSOLE', msg.type(), msg.text()));
  page.on('response', (res) => {
    if (res.url().includes('/api/')) console.log('RESPONSE', res.status(), res.url());
  });

  await page.goto('http://localhost:5173/projects/authentication');
  const csrfResult = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/csrf', { credentials: 'include' });
      const txt = await r.text();
      return { status: r.status, ok: r.ok, text: txt.slice(0, 300) };
    } catch (e) {
      return { error: String(e) };
    }
  });
  console.log('CSRF_RESULT', JSON.stringify(csrfResult, null, 2));

  const registerResult = await page.evaluate(async () => {
    try {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'probe', email: 'probe@test.local', password: 'StrongPass123!', confirmPassword: 'StrongPass123!' }),
      });
      const txt = await r.text();
      return { status: r.status, ok: r.ok, text: txt.slice(0, 300) };
    } catch (e) {
      return { error: String(e) };
    }
  });
  console.log('REGISTER_RESULT', JSON.stringify(registerResult, null, 2));

  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
