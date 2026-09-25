import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/projects/authentication');
  const result = await page.evaluate(() => {
    const forms = [...document.querySelectorAll('form')].map((form, index) => ({
      index,
      id: form.id,
      containsCreate: !!form.querySelector('button') && form.textContent?.includes('Create account'),
      html: form.outerHTML.slice(0, 400),
      fields: [...form.querySelectorAll('input')].map((input) => ({ id: input.id, name: input.name, type: input.type, value: input.value })),
    }));
    return forms;
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
