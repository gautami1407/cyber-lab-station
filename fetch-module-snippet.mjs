const url = 'http://localhost:5173/src/features/AuthenticationPage.tsx';
const res = await fetch(url);
const text = await res.text();
const idx = text.indexOf('submitRegistration');
console.log(text.slice(Math.max(0, idx - 800), idx + 2200));
