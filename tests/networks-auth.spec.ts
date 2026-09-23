import { test, expect, type Page } from '@playwright/test';

const API_BASE = 'http://localhost:4000/api';
const FRONTEND_BASE = 'http://localhost:5173';

async function registerAndLogin(page: Page) {
  const timestamp = Date.now();
  const username = `pw${timestamp}`;
  const email = `pw${timestamp}@test.local`;
  const password = 'UniversityLab!2026';

  // Navigate to authentication page
  await page.goto(`${FRONTEND_BASE}/projects/authentication`);
  await page.waitForTimeout(1000);

  // Fill out registration form
  await page.fill('input[id="register-username"]', username);
  await page.fill('input[id="register-email"]', email);
  await page.fill('input[id="register-password"]', password);
  await page.fill('input[id="register-confirm"]', password);

  // Click Register button
  await page.click('button:has-text("Register")');

  // Wait for success
  await page.waitForTimeout(2000);

  return { username, email, password };
}

test.describe('Networks & Devices Full Flow', () => {
  test('should show auth prompt when not logged in', async ({ page }) => {
    await page.goto(`${FRONTEND_BASE}/networks`);
    await page.waitForTimeout(2000);

    // Should show authentication required message with link
    await expect(page.locator('text=Authentication Required')).toBeVisible();
    await expect(page.locator('text=You must be signed in')).toBeVisible();
    await expect(page.locator('a:has-text("Go to Register / Login")')).toBeVisible();

    // Should NOT show interface sections
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('No IPv4 interfaces available');
  });

  test('should allow authenticated users to see real interfaces', async ({ page }) => {
    // Register and login
    const credentials = await registerAndLogin(page);
    console.log('Registered user:', credentials.username);

    // Navigate to networks page
    await page.goto(`${FRONTEND_BASE}/networks`);
    await page.waitForTimeout(3000);

    // Should show Networks & Devices page
    await expect(page.locator('text=Networks & Devices')).toBeVisible();

    // Should NOT show authentication error
    await expect(page.locator('text=Authentication Required')).not.toBeVisible();

    // Should show local interfaces section
    await expect(page.locator('text=Local interfaces')).toBeVisible();

    const bodyText = await page.textContent('body');

    // Check for real Windows interfaces
    const hasWiFi = bodyText?.includes('Wi-Fi');
    const hasEthernet = bodyText?.includes('Ethernet');
    const hasVEthernet = bodyText?.includes('vEthernet');

    console.log('Interfaces detected:', { hasWiFi, hasEthernet, hasVEthernet });

    // Should have at least one real interface
    if (!hasWiFi && !hasEthernet && !hasVEthernet) {
      console.error('No real Windows interfaces detected!');
      await page.screenshot({ path: 'tests/screenshots/no-interfaces.png', fullPage: true });
      throw new Error('Expected at least one real Windows interface');
    }

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/authenticated-networks.png', fullPage: true });
  });

  test('complete flow: register, auth, authorize, discover', async ({ page }) => {
    // Step 1: Register
    const credentials = await registerAndLogin(page);
    console.log('✓ User registered:', credentials.username);

    // Step 2: Navigate to Networks & Devices
    await page.goto(`${FRONTEND_BASE}/networks`);
    await page.waitForTimeout(3000);

    // Step 3: Verify authenticated state
    await expect(page.locator('text=Local interfaces')).toBeVisible();
    console.log('✓ Authenticated and viewing Networks page');

    // Step 4: Find and authorize first interface
    const authorizeButtons = page.locator('button:has-text("Authorize network")');
    const buttonCount = await authorizeButtons.count();
    console.log(`Found ${buttonCount} authorize buttons`);

    if (buttonCount === 0) {
      await page.screenshot({ path: 'tests/screenshots/no-interfaces-to-authorize.png', fullPage: true });
      throw new Error('No interfaces available to authorize');
    }

    // Click first authorize button
    await authorizeButtons.first().click();
    await page.waitForTimeout(3000);
    console.log('✓ Interface authorized');

    // Step 5: Verify authorized network appears
    await expect(page.locator('text=Authorized networks')).toBeVisible();
    const bodyText = await page.textContent('body');
    
    if (bodyText?.includes('No authorized networks')) {
      await page.screenshot({ path: 'tests/screenshots/authorization-failed.png', fullPage: true });
      throw new Error('Authorization did not persist');
    }

    // Step 6: Start discovery
    const discoverButton = page.locator('button:has-text("Discover")').first();
    await expect(discoverButton).toBeVisible();
    await discoverButton.click();
    console.log('✓ Discovery started');

    // Wait for discovery to complete (can take 5-10 seconds)
    await page.waitForTimeout(15000);

    // Step 7: Verify devices section
    await expect(page.locator('text=Observed devices')).toBeVisible();

    // Check if devices were discovered
    const finalBodyText = await page.textContent('body');
    const hasDevices = !finalBodyText?.includes('No data available');

    if (hasDevices) {
      console.log('✓ Devices discovered!');
    } else {
      console.log('⚠ No devices found (may be normal for empty network)');
    }

    // Final screenshot
    await page.screenshot({ path: 'tests/screenshots/complete-flow.png', fullPage: true });
    console.log('✓ Complete flow test passed!');
  });

  test('backend API returns real Windows interfaces when authenticated', async ({ page, request }) => {
    // First register a user via the frontend
    await registerAndLogin(page);

    // The cookies from the frontend page context should now be available
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'cyberlab.sid');

    if (!sessionCookie) {
      throw new Error('No session cookie found after registration');
    }

    console.log('Session cookie obtained');

    // Make API call with cookie
    const response = await request.get(`${API_BASE}/networks/interfaces`, {
      headers: {
        'Cookie': `cyberlab.sid=${sessionCookie.value}`
      }
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));

    // Verify structure
    expect(data.success).toBe(true);
    expect(Array.isArray(data.data)).toBe(true);

    const interfaces = data.data;
    
    // Should have at least one interface
    expect(interfaces.length).toBeGreaterThan(0);

    // Check for real Windows interface names
    const interfaceNames = interfaces.map((i: any) => i.name);
    console.log('Interface names:', interfaceNames);

    const hasRealInterface = interfaceNames.some((name: string) =>
      name.includes('Wi-Fi') ||
      name.includes('Ethernet') ||
      name.includes('vEthernet') ||
      name.includes('Loopback')
    );

    expect(hasRealInterface).toBe(true);

    // Verify each interface has required fields
    for (const iface of interfaces) {
      expect(iface).toHaveProperty('name');
      expect(iface).toHaveProperty('ipv4Address');
      expect(iface).toHaveProperty('netmask');
      expect(iface).toHaveProperty('cidr');
      expect(iface).toHaveProperty('isUp');

      // Verify IP format
      expect(iface.ipv4Address).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
      
      // Verify CIDR format
      expect(iface.cidr).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/);

      console.log(`✓ Interface: ${iface.name} - ${iface.ipv4Address} (${iface.cidr})`);
    }
  });
});
