# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: networks-auth.spec.ts >> Authentication and networks access >> should register a new account and keep the user signed in
- Location: tests\networks-auth.spec.ts:67:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForResponse: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - generic [ref=f1e5]:
      - link "NetLink Network Intelligence" [ref=f1e7] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=f1e11]:
          - generic [ref=f1e12]: NetLink
          - generic [ref=f1e13]: Network Intelligence
      - generic [ref=f1e14]:
        - generic [ref=f1e15]:
          - generic [ref=f1e16]: Overview
          - list [ref=f1e18]:
            - listitem [ref=f1e19]:
              - link "Dashboard" [ref=f1e20] [cursor=pointer]:
                - /url: /dashboard
            - listitem [ref=f1e27]:
              - link "Networks & Devices" [ref=f1e28] [cursor=pointer]:
                - /url: /networks
            - listitem [ref=f1e37]:
              - link "Topology" [ref=f1e38] [cursor=pointer]:
                - /url: /topology
        - generic [ref=f1e47]:
          - generic [ref=f1e48]: Projects
          - list [ref=f1e50]:
            - listitem [ref=f1e51]:
              - link "Authentication" [ref=f1e52] [cursor=pointer]:
                - /url: /projects/authentication
            - listitem [ref=f1e63]:
              - link "Port Scanner" [ref=f1e64] [cursor=pointer]:
                - /url: /projects/port-scanner
            - listitem [ref=f1e73]:
              - link "IP Range Scanner" [ref=f1e74] [cursor=pointer]:
                - /url: /projects/ip-range-scanner
            - listitem [ref=f1e83]:
              - link "Application Security" [ref=f1e84] [cursor=pointer]:
                - /url: /projects/application-security
            - listitem [ref=f1e89]:
              - link "Subdomain Enumeration" [ref=f1e90] [cursor=pointer]:
                - /url: /projects/subdomain-enumeration
        - generic [ref=f1e95]:
          - generic [ref=f1e96]: Operations
          - list [ref=f1e98]:
            - listitem [ref=f1e99]:
              - link "Monitoring" [ref=f1e100] [cursor=pointer]:
                - /url: /monitoring
            - listitem [ref=f1e104]:
              - link "Diagnostics" [ref=f1e105] [cursor=pointer]:
                - /url: /diagnostics
            - listitem [ref=f1e109]:
              - link "Remote Devices" [ref=f1e110] [cursor=pointer]:
                - /url: /remote-devices
            - listitem [ref=f1e114]:
              - link "Activity" [ref=f1e115] [cursor=pointer]:
                - /url: /activity
            - listitem [ref=f1e119]:
              - link "Audit Logs" [ref=f1e120] [cursor=pointer]:
                - /url: /audit-logs
            - listitem [ref=f1e125]:
              - link "Documentation" [ref=f1e126] [cursor=pointer]:
                - /url: /documentation
            - listitem [ref=f1e130]:
              - link "Settings" [ref=f1e131] [cursor=pointer]:
                - /url: /settings
      - generic [ref=f1e136]:
        - generic [ref=f1e137]:
          - paragraph [ref=f1e138]:
            - generic [ref=f1e139]: Mode
            - generic [ref=f1e140]: LAB
          - paragraph [ref=f1e143]:
            - generic [ref=f1e144]: Backend / API
            - generic [ref=f1e145]: Connected
        - generic [ref=f1e147]:
          - generic [ref=f1e148]: NA
          - generic [ref=f1e150]:
            - paragraph [ref=f1e151]: Not signed in
            - paragraph [ref=f1e152]: Register to persist sessions
    - main [ref=f1e153]:
      - generic [ref=f1e154]:
        - generic [ref=f1e155]:
          - paragraph [ref=f1e156]: Authentication Toolkit
          - paragraph [ref=f1e157]: Registration, login, password policy, and session controls.
        - generic [ref=f1e158]: ● Connected
        - button "Notifications" [ref=f1e160] [cursor=pointer]
        - button "User menu" [ref=f1e161] [cursor=pointer]
      - generic [ref=f1e163]:
        - generic [ref=f1e176]:
          - paragraph [ref=f1e177]: Project 01
          - heading "Authentication Toolkit" [level=1] [ref=f1e178]
          - paragraph [ref=f1e179]: Register and sign in against PostgreSQL. Passwords are hashed with Argon2id and never stored in plaintext.
        - generic [ref=f1e180]:
          - tablist [ref=f1e181]:
            - tab "Register" [selected] [ref=f1e182] [cursor=pointer]
            - tab "Login" [ref=f1e183] [cursor=pointer]
            - tab "Password Strength" [ref=f1e184] [cursor=pointer]
            - tab "Sessions" [ref=f1e185] [cursor=pointer]
            - tab "Security Controls" [ref=f1e186] [cursor=pointer]
          - tabpanel "Register" [ref=f1e187]:
            - generic [ref=f1e188]:
              - generic [ref=f1e189]:
                - generic [ref=f1e190]:
                  - text: Username
                  - textbox "Username" [ref=f1e191]
                - generic [ref=f1e192]:
                  - text: Email
                  - textbox "Email" [ref=f1e193]
                - generic [ref=f1e194]:
                  - text: Password
                  - generic [ref=f1e195]:
                    - textbox "Password" [ref=f1e196]
                    - button "Show Password" [ref=f1e197] [cursor=pointer]
                - generic [ref=f1e198]:
                  - text: Confirm Password
                  - generic [ref=f1e199]:
                    - textbox "Confirm Password" [ref=f1e200]
                    - button "Show Confirm Password" [ref=f1e201] [cursor=pointer]
                - button "Create account" [ref=f1e202] [cursor=pointer]
              - generic [ref=f1e204]:
                - generic [ref=f1e205]:
                  - generic [ref=f1e206]: Password strength
                  - generic [ref=f1e207]: Very Weak
                - paragraph [ref=f1e213]: "Password strength: Very Weak"
                - list [ref=f1e214]:
                  - listitem [ref=f1e215]:
                    - generic [ref=f1e219]: At least 12 characters
                    - generic [ref=f1e220]: requirement not met
                  - listitem [ref=f1e221]:
                    - generic [ref=f1e225]: One uppercase letter (A–Z)
                    - generic [ref=f1e226]: requirement not met
                  - listitem [ref=f1e227]:
                    - generic [ref=f1e231]: One lowercase letter (a–z)
                    - generic [ref=f1e232]: requirement not met
                  - listitem [ref=f1e233]:
                    - generic [ref=f1e237]: One number (0–9)
                    - generic [ref=f1e238]: requirement not met
                  - listitem [ref=f1e239]:
                    - generic [ref=f1e243]: One special character (!@#$…)
                    - generic [ref=f1e244]: requirement not met
  - region "Notifications alt+T"
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | 
  3  | const FRONTEND_BASE = 'http://localhost:5173';
  4  | 
  5  | async function registerUser(page: Page) {
  6  |   const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  7  |   const username = `pw${timestamp}`;
  8  |   const email = `pw${timestamp}@test.local`;
  9  |   const password = 'UniversityLab!2026';
  10 | 
  11 |   await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  12 |   await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  13 |   await expect(page.getByRole('tab', { name: 'Login' })).toBeVisible();
  14 | 
  15 |   const regUsername = page.locator('#reg-username');
  16 |   const regEmail = page.locator('#reg-email');
  17 |   const regPassword = page.locator('#reg-password');
  18 |   const regConfirm = page.locator('#reg-confirm');
  19 | 
  20 |   await regUsername.fill(username);
  21 |   await regEmail.fill(email);
  22 |   await regPassword.fill(password);
  23 |   await regConfirm.fill(password);
  24 | 
  25 |   await expect(regUsername).toHaveValue(username);
  26 |   await expect(regEmail).toHaveValue(email);
  27 |   await expect(regPassword).toHaveValue(password);
  28 |   await expect(regConfirm).toHaveValue(password);
  29 | 
> 30 |   const registerResponse = page.waitForResponse(
     |                                 ^ Error: page.waitForResponse: Test timeout of 30000ms exceeded.
  31 |     (response) => response.url().includes('/api/auth/register') && response.request().method() === 'POST',
  32 |   );
  33 |   await page.getByRole('button', { name: 'Create account' }).click();
  34 |   await registerResponse;
  35 |   await expect(page.getByText('Registration succeeded')).toBeVisible({ timeout: 15000 });
  36 | 
  37 |   return { username, email, password };
  38 | }
  39 | 
  40 | async function loginUser(page: Page, username: string, password: string) {
  41 |   await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  42 |   await page.getByRole('tab', { name: 'Login' }).click();
  43 |   await expect(page.locator('#login-id')).toBeVisible();
  44 |   const loginId = page.locator('#login-id');
  45 |   const loginPassword = page.locator('#login-password');
  46 | 
  47 |   await loginId.fill(username);
  48 |   await loginPassword.fill(password);
  49 |   await expect(loginId).toHaveValue(username);
  50 |   await expect(loginPassword).toHaveValue(password);
  51 | 
  52 |   const loginResponse = page.waitForResponse(
  53 |     (response) => response.url().includes('/api/auth/login') && response.request().method() === 'POST',
  54 |   );
  55 |   await page.getByRole('button', { name: 'Login' }).click();
  56 |   await loginResponse;
  57 |   await expect(page.getByText('Signed in')).toBeVisible({ timeout: 15000 });
  58 | }
  59 | 
  60 | test.describe('Authentication and networks access', () => {
  61 |   test('should show an auth prompt for unauthenticated users', async ({ page }) => {
  62 |     await page.goto(`${FRONTEND_BASE}/networks`);
  63 |     await expect(page.getByRole('heading', { name: 'Authentication Required' })).toBeVisible();
  64 |     await expect(page.getByRole('link', { name: 'Go to Register / Login' })).toBeVisible();
  65 |   });
  66 | 
  67 |   test('should register a new account and keep the user signed in', async ({ page }) => {
  68 |     const credentials = await registerUser(page);
  69 |     await page.goto(`${FRONTEND_BASE}/dashboard`);
  70 |     await expect(page.getByText('Dashboard')).toBeVisible();
  71 |     await expect(page.getByText(credentials.username)).toBeVisible();
  72 |   });
  73 | 
  74 |   test('should log in with an existing account and reach the networks page', async ({ page }) => {
  75 |     const credentials = await registerUser(page);
  76 |     await loginUser(page, credentials.username, credentials.password);
  77 |     await page.goto(`${FRONTEND_BASE}/networks`);
  78 |     await expect(page.getByRole('heading', { name: 'Networks & Devices' })).toBeVisible();
  79 |     await expect(page.getByText('Local interfaces')).toBeVisible();
  80 |   });
  81 | });
  82 | 
```