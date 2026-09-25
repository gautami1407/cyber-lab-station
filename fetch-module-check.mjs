import { readFileSync } from 'node:fs';

const url = 'http://localhost:5173/src/features/AuthenticationPage.tsx';
const res = await fetch(url);
const text = await res.text();
console.log('STATUS', res.status);
for (const needle of ['submitRegistration', 'Create account', 'REG_SUBMIT_VALUES', 'formRef']) {
  console.log(needle, text.includes(needle));
}
console.log(text.slice(0, 500));
