#!/usr/bin/env node
/**
 * Quick verification script for Networks & Devices fix
 * Tests the complete authentication and interface detection flow
 */

const API_BASE = 'http://localhost:4000/api';

console.log('\n=== NETWORKS & DEVICES FIX VERIFICATION ===\n');

let allPassed = true;

function fail(message) {
  console.log(`❌ FAIL: ${message}`);
  allPassed = false;
}

function pass(message) {
  console.log(`✅ PASS: ${message}`);
}

// Test 1: Health check
console.log('Test 1: Backend health check');
try {
  const health = await fetch(`${API_BASE}/health`, { method: 'GET' });
  const healthData = await health.json();
  
  if (healthData.success && healthData.data.database === true) {
    pass('Backend is running and PostgreSQL is connected');
  } else {
    fail('Backend health check failed');
  }
} catch (error) {
  fail(`Backend is not reachable: ${error.message}`);
}

// Test 2: Unauthenticated access returns 401
console.log('\nTest 2: Unauthenticated access to /networks/interfaces');
try {
  const response = await fetch(`${API_BASE}/networks/interfaces`, { 
    credentials: 'include' 
  });
  
  if (response.status === 401) {
    pass('Correctly returns 401 for unauthenticated request');
  } else {
    fail(`Expected 401 but got ${response.status}`);
  }
} catch (error) {
  fail(`Request failed: ${error.message}`);
}

// Test 3: Register user and get session
console.log('\nTest 3: User registration and authentication');
let sessionCookie = null;
let csrfCookie = null;

try {
  // Get CSRF token
  const csrfRes = await fetch(`${API_BASE}/csrf`, { credentials: 'include' });
  const csrfData = await csrfRes.json();
  const csrfToken = csrfData.data.csrfToken;
  
  const csrfSetCookie = csrfRes.headers.get('set-cookie');
  if (csrfSetCookie) {
    const match = csrfSetCookie.match(/cyberlab\.csrf=([^;]+)/);
    if (match) csrfCookie = match[1];
  }
  
  // Register user
  const timestamp = Date.now();
  const username = `verify${timestamp}`;
  const registerRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      'Cookie': `cyberlab.csrf=${csrfCookie}`
    },
    credentials: 'include',
    body: JSON.stringify({
      username,
      email: `${username}@test.local`,
      password: 'UniversityLab!2026',
      confirmPassword: 'UniversityLab!2026'
    })
  });
  
  if (registerRes.ok) {
    const registerData = await registerRes.json();
    const cookies = registerRes.headers.get('set-cookie');
    if (cookies) {
      const match = cookies.match(/cyberlab\.sid=([^;]+)/);
      if (match) {
        sessionCookie = match[1];
        pass(`User registered successfully: ${username}`);
      } else {
        fail('No session cookie in registration response');
      }
    } else {
      fail('No cookies in registration response');
    }
  } else {
    fail(`Registration failed with status ${registerRes.status}`);
  }
} catch (error) {
  fail(`Registration error: ${error.message}`);
}

// Test 4: Authenticated access to interfaces
if (sessionCookie) {
  console.log('\nTest 4: Authenticated access to /networks/interfaces');
  try {
    const response = await fetch(`${API_BASE}/networks/interfaces`, {
      headers: { 'Cookie': `cyberlab.sid=${sessionCookie}` },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.success && Array.isArray(data.data)) {
        const interfaces = data.data;
        const count = interfaces.length;
        
        if (count > 0) {
          pass(`Retrieved ${count} real Windows IPv4 interface(s)`);
          
          // Check for real Windows interface names
          const names = interfaces.map(i => i.name);
          const hasReal = names.some(n => 
            n.includes('Wi-Fi') || 
            n.includes('Ethernet') || 
            n.includes('vEthernet') || 
            n.includes('Loopback')
          );
          
          if (hasReal) {
            pass('Interfaces have real Windows adapter names');
          } else {
            fail(`Interface names don't match Windows patterns: ${names.join(', ')}`);
          }
          
          // Verify structure
          let structureValid = true;
          for (const iface of interfaces) {
            if (!iface.name || !iface.ipv4Address || !iface.cidr || typeof iface.isUp !== 'boolean') {
              structureValid = false;
              fail(`Interface missing required fields: ${JSON.stringify(iface)}`);
              break;
            }
            
            // Check IPv4 format
            if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(iface.ipv4Address)) {
              structureValid = false;
              fail(`Invalid IPv4 address: ${iface.ipv4Address}`);
              break;
            }
            
            // Check CIDR format
            if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(iface.cidr)) {
              structureValid = false;
              fail(`Invalid CIDR: ${iface.cidr}`);
              break;
            }
          }
          
          if (structureValid) {
            pass('All interfaces have valid structure and format');
          }
          
          // Display interfaces
          console.log('\n   Detected interfaces:');
          for (const iface of interfaces) {
            console.log(`   - ${iface.name}: ${iface.ipv4Address} (${iface.cidr}) ${iface.isUp ? '🟢' : '🔴'}`);
          }
          
        } else {
          fail('No interfaces returned (expected at least 1)');
        }
      } else {
        fail('Invalid response structure from /networks/interfaces');
      }
    } else {
      fail(`Failed to fetch interfaces: ${response.status}`);
    }
  } catch (error) {
    fail(`Interface fetch error: ${error.message}`);
  }
} else {
  console.log('\nTest 4: SKIPPED (no session cookie)');
}

// Test 5: Verify session endpoint
if (sessionCookie) {
  console.log('\nTest 5: Session endpoint verification');
  try {
    const response = await fetch(`${API_BASE}/auth/session`, {
      headers: { 'Cookie': `cyberlab.sid=${sessionCookie}` },
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.data.user && data.data.session) {
        pass('Session endpoint returns valid user and session data');
      } else {
        fail('Session endpoint returned invalid structure');
      }
    } else {
      fail(`Session endpoint returned ${response.status}`);
    }
  } catch (error) {
    fail(`Session endpoint error: ${error.message}`);
  }
} else {
  console.log('\nTest 5: SKIPPED (no session cookie)');
}

// Test 6: Authorize a network
if (sessionCookie) {
  console.log('\nTest 6: Network authorization');
  try {
    // First get interfaces
    const interfacesRes = await fetch(`${API_BASE}/networks/interfaces`, {
      headers: { 'Cookie': `cyberlab.sid=${sessionCookie}` },
      credentials: 'include'
    });
    
    if (interfacesRes.ok) {
      const interfacesData = await interfacesRes.json();
      const interfaces = interfacesData.data;
      
      if (interfaces.length > 0) {
        const firstInterface = interfaces[0];
        
        // Get CSRF token
        const csrfRes = await fetch(`${API_BASE}/csrf`, { 
          headers: { 'Cookie': `cyberlab.sid=${sessionCookie}` },
          credentials: 'include' 
        });
        const csrfData = await csrfRes.json();
        const csrfToken = csrfData.data.csrfToken;
        
        const csrfSetCookie = csrfRes.headers.get('set-cookie');
        let csrfCookieValue = null;
        if (csrfSetCookie) {
          const match = csrfSetCookie.match(/cyberlab\.csrf=([^;]+)/);
          if (match) csrfCookieValue = match[1];
        }
        
        // Authorize network
        const authorizeRes = await fetch(`${API_BASE}/networks/authorize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
            'Cookie': `cyberlab.sid=${sessionCookie}; cyberlab.csrf=${csrfCookieValue}`
          },
          credentials: 'include',
          body: JSON.stringify({
            interfaceName: firstInterface.name,
            ipv4Address: firstInterface.ipv4Address,
            cidr: firstInterface.cidr
          })
        });
        
        if (authorizeRes.ok) {
          const authorizeData = await authorizeRes.json();
          if (authorizeData.success) {
            pass(`Successfully authorized network: ${firstInterface.cidr}`);
          } else {
            fail('Authorization response missing success flag');
          }
        } else {
          fail(`Authorization failed with status ${authorizeRes.status}`);
        }
      } else {
        console.log('   ⚠️  SKIP: No interfaces available to authorize');
      }
    }
  } catch (error) {
    fail(`Authorization error: ${error.message}`);
  }
} else {
  console.log('\nTest 6: SKIPPED (no session cookie)');
}

// Summary
console.log('\n' + '='.repeat(50));
if (allPassed) {
  console.log('✅ ALL TESTS PASSED');
  console.log('\nThe Networks & Devices fix is working correctly:');
  console.log('  • Backend authentication enforced');
  console.log('  • Real Windows IPv4 interfaces detected');
  console.log('  • Interface structure validated');
  console.log('  • Network authorization works');
  console.log('\n✅ VERIFICATION COMPLETE');
} else {
  console.log('❌ SOME TESTS FAILED');
  console.log('\nPlease review the failures above.');
  process.exit(1);
}
console.log('='.repeat(50) + '\n');
