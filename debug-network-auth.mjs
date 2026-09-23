#!/usr/bin/env node
/**
 * Debug script to test Networks & Devices authentication flow
 */

import os from 'node:os';

const API_BASE = 'http://localhost:4000/api';

console.log('\n=== NETWORKS & DEVICES DEBUG ===\n');

// Step 1: Check local interfaces from OS
console.log('1. Windows OS Network Interfaces:');
console.log('----------------------------------');
const interfaces = os.networkInterfaces();
for (const [name, addresses] of Object.entries(interfaces)) {
  console.log(`\n${name}:`);
  for (const addr of addresses ?? []) {
    if (addr.family === 'IPv4' || addr.family === 4) {
      console.log(`  IPv4: ${addr.address}`);
      console.log(`  Netmask: ${addr.netmask}`);
      console.log(`  MAC: ${addr.mac || 'N/A'}`);
      console.log(`  Internal: ${addr.internal}`);
    }
  }
}

// Step 2: Test CSRF endpoint (no auth required)
console.log('\n\n2. Testing CSRF endpoint (no auth):');
console.log('------------------------------------');
try {
  const csrfRes = await fetch(`${API_BASE}/csrf`, {
    credentials: 'include'
  });
  console.log(`Status: ${csrfRes.status}`);
  const csrfData = await csrfRes.json();
  console.log('Response:', csrfData);
  
  const cookies = csrfRes.headers.get('set-cookie');
  if (cookies) {
    console.log('Cookies set:', cookies);
  }
} catch (error) {
  console.error('CSRF Error:', error.message);
}

// Step 3: Test session endpoint WITHOUT auth (should fail)
console.log('\n\n3. Testing /auth/session WITHOUT credentials:');
console.log('----------------------------------------------');
try {
  const sessionRes = await fetch(`${API_BASE}/auth/session`, {
    credentials: 'include'
  });
  console.log(`Status: ${sessionRes.status}`);
  const sessionData = await sessionRes.json();
  console.log('Response:', sessionData);
} catch (error) {
  console.error('Session Error:', error.message);
}

// Step 4: Test interfaces endpoint WITHOUT auth (should fail)
console.log('\n\n4. Testing /networks/interfaces WITHOUT credentials:');
console.log('-----------------------------------------------------');
try {
  const interfacesRes = await fetch(`${API_BASE}/networks/interfaces`, {
    credentials: 'include'
  });
  console.log(`Status: ${interfacesRes.status}`);
  const interfacesData = await interfacesRes.json();
  console.log('Response:', interfacesData);
} catch (error) {
  console.error('Interfaces Error:', error.message);
}

// Step 5: Register a test user (if needed) and login
console.log('\n\n5. Register and login with test credentials:');
console.log('---------------------------------------------');
let sessionCookie = null;
let csrfCookie = null;
const testUsername = `debuguser${Date.now()}`;
const testPassword = 'UniversityLab!2026';
try {
  // First get CSRF token for registration
  const csrfRes = await fetch(`${API_BASE}/csrf`, {
    credentials: 'include'
  });
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.success ? csrfData.data.csrfToken : null;
  
  // Extract CSRF cookie
  const csrfSetCookie = csrfRes.headers.get('set-cookie');
  if (csrfSetCookie) {
    const match = csrfSetCookie.match(/cyberlab\.csrf=([^;]+)/);
    if (match) {
      csrfCookie = match[1];
    }
  }
  
  if (!csrfToken || !csrfCookie) {
    console.error('Could not obtain CSRF token or cookie');
  } else {
    console.log('CSRF token obtained for registration');
    
    // Register new user
    console.log(`\nRegistering user: ${testUsername}`);
    const registerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        'Cookie': `cyberlab.csrf=${csrfCookie}`
      },
      credentials: 'include',
      body: JSON.stringify({
        username: testUsername,
        email: `${testUsername}@example.test`,
        password: testPassword,
        confirmPassword: testPassword
      })
    });
    
    console.log(`Register Status: ${registerRes.status}`);
    const registerData = await registerRes.json();
    console.log('Register Response:', registerData.success ? 'Success' : registerData.error);
    
    // Extract session cookie from registration (auto-login)
    const registerCookies = registerRes.headers.get('set-cookie');
    if (registerCookies) {
      const match = registerCookies.match(/cyberlab\.sid=([^;]+)/);
      if (match) {
        sessionCookie = match[1];
        console.log('Session cookie extracted from registration:', sessionCookie.substring(0, 20) + '...');
      }
    }
  }
} catch (error) {
  console.error('Registration Error:', error.message);
}

// Step 6: Test session endpoint WITH auth (if login succeeded)
if (sessionCookie) {
  console.log('\n\n6. Testing /auth/session WITH credentials:');
  console.log('-------------------------------------------');
  try {
    const sessionRes = await fetch(`${API_BASE}/auth/session`, {
      headers: {
        'Cookie': `cyberlab.sid=${sessionCookie}`
      },
      credentials: 'include'
    });
    console.log(`Status: ${sessionRes.status}`);
    const sessionData = await sessionRes.json();
    console.log('Response:', JSON.stringify(sessionData, null, 2));
  } catch (error) {
    console.error('Session Error:', error.message);
  }

  // Step 7: Test interfaces endpoint WITH auth
  console.log('\n\n7. Testing /networks/interfaces WITH credentials:');
  console.log('--------------------------------------------------');
  try {
    const interfacesRes = await fetch(`${API_BASE}/networks/interfaces`, {
      headers: {
        'Cookie': `cyberlab.sid=${sessionCookie}`
      },
      credentials: 'include'
    });
    console.log(`Status: ${interfacesRes.status}`);
    const interfacesData = await interfacesRes.json();
    console.log('Response:', JSON.stringify(interfacesData, null, 2));
  } catch (error) {
    console.error('Interfaces Error:', error.message);
  }
} else {
  console.log('\n\n6-7. Skipped (no session cookie available)');
  console.log('-------------------------------------------');
  console.log('Registration failed. Check server logs.');
}

console.log('\n=== END DEBUG ===\n');
