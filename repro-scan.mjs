// Live verification repro for the Port Scanner authorization + CSRF origin fix.
// Mirrors what the browser does (cookies + CSRF token + Origin headers) and also
// exercises the real "authorize network" flow so the per-user enforcement works
// end to end:
//   1) Register User B (authorized) and User C (unauthorized).
//   2) User B authorizes the loopback network via POST /api/networks/authorize
//      (using the interface discovered from GET /api/networks/interfaces).
//   3) User B scan of 127.0.0.1 must succeed (202).
//   4) User C scan of 127.0.0.1 must be rejected with 403 TARGET_UNAUTHORIZED.
//   5) The scan POST must be accepted with Origin http://localhost:8082 (CSRF fix)
//      and rejected with a remote Origin.
// Prints PASS/FAIL per step and exits non-zero on any failure.
const BASE = "http://localhost:4000";
const DEV_ORIGIN = "http://localhost:8082";
const REMOTE_ORIGIN = "https://evil.example";
const PASSWORD = "Str0ng!Passw0rd";

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} | ${label}${detail ? ` | ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function parseCookies(response) {
  const jar = {};
  const setCookies = response.headers.getSetCookie?.() ?? [];
  for (const line of setCookies.length ? setCookies : response.headers.get("set-cookie")?.split(/,(?=[^;]+=)/) ?? []) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return jar;
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(jar, method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": token,
      Origin: DEV_ORIGIN,
      Cookie: cookieHeader(jar),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { res, json };
}

async function newSession(label) {
  const jar = {};
  const csrfRes = await fetch(`${BASE}/api/csrf`, { credentials: "include" });
  Object.assign(jar, parseCookies(csrfRes));
  const csrfBody = await csrfRes.json();
  const token = csrfBody.data?.csrfToken;
  check(`${label}: GET /api/csrf`, Boolean(token), `status=${csrfRes.status}`);
  if (!token) return { jar, token: null, username: null };

  const username = `${label}-${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const reg = await request(jar, "POST", "/api/auth/register", {
    username,
    email: `${username}@example.test`,
    password: PASSWORD,
    confirmPassword: PASSWORD,
  }, token);
  Object.assign(jar, parseCookies(reg.res));
  const created = reg.res.status === 201;
  check(`${label}: register`, created, `status=${reg.res.status}`);
  return { jar, token, username: created ? username : null };
}
async function main() {
  console.log(`Base: ${BASE} | Origin under test: ${DEV_ORIGIN}\n`);

  const userB = await newSession("userb");
  const userC = await newSession("userc");
  if (!userB.token || !userC.token) {
    console.error("Aborting: could not establish sessions.");
    process.exit(1);
  }

  // --- User B authorizes the loopback network (real API flow) ---
  const ifaces = await request(userB.jar, "GET", "/api/networks/interfaces", null, userB.token);
  const loopback = ifaces.json?.data?.find((item) => item.ipv4Address === "127.0.0.1") ??
    ifaces.json?.data?.find((item) => item.name === "lo");
  check("User B: list interfaces", loopback != null, `interfaces=${JSON.stringify(ifaces.json?.data ?? [])}`);
  if (!loopback) process.exit(1);

  const authz = await request(userB.jar, "POST", "/api/networks/authorize", {
    interfaceName: loopback.name,
    ipv4Address: loopback.ipv4Address,
    cidr: loopback.cidr,
  }, userB.token);
  check("User B: authorize loopback network", authz.res.status === 201, `status=${authz.res.status} ${JSON.stringify(authz.json)}`);

  // --- Scans --------------------------------------------------------------
  async function scan(jar, token, label, body, origin = DEV_ORIGIN) {
    const res = await fetch(`${BASE}/api/scanner/ports`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        Origin: origin,
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* non-JSON body */
    }
    console.log(`\n=== ${label} ===`);
    console.log("STATUS:", res.status);
    console.log("BODY:", JSON.stringify(json, null, 2));
    return { status: res.status, json };
  }

  const payload = { target: "127.0.0.1", startPort: 4001, endPort: 4002, profile: "custom", authorized: true };

  const bScan = await scan(userB.jar, userB.token, "User B scans 127.0.0.1 (expect 202)", payload, DEV_ORIGIN);
  check("User B scan accepted", bScan.status === 202, `got ${bScan.status}`);

  const operationId = bScan.json?.data?.operationId;
  if (operationId) {
    let status = "";
    for (let i = 0; i < 30; i += 1) {
      const snap = await request(userB.jar, "GET", `/api/operations/${operationId}`, null, userB.token);
      status = snap.json?.data?.status ?? "";
      if (["completed", "failed", "cancelled"].includes(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    check("User B op completed", status === "completed", `final status=${status}`);
  }

  const cScan = await scan(userC.jar, userC.token, "User C scans 127.0.0.1 (expect 403 TARGET_UNAUTHORIZED)", payload, DEV_ORIGIN);
  check("User C scan rejected (per-user auth)", cScan.status === 403 && cScan.json?.error?.code === "TARGET_UNAUTHORIZED", `got ${cScan.status} ${cScan.json?.error?.code ?? ""}`);

  const bRemote = await scan(userB.jar, userB.token, "User B scan with remote Origin (expect 403 FORBIDDEN)", payload, REMOTE_ORIGIN);
  check("Remote origin rejected", bRemote.status === 403 && bRemote.json?.error?.code === "FORBIDDEN", `got ${bRemote.status} ${bRemote.json?.error?.code ?? ""}`);

  const bNoCheckbox = await scan(userB.jar, userB.token, "User B scan authorized=false (expect 400 AUTHORIZATION_REQUIRED)", {
    ...payload,
    authorized: false,
  }, DEV_ORIGIN);
  check("Checkbox requirement enforced", bNoCheckbox.status === 400 && bNoCheckbox.json?.error?.code === "AUTHORIZATION_REQUIRED", `got ${bNoCheckbox.status} ${bNoCheckbox.json?.error?.code ?? ""}`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("REPRO ERROR:", error);
  process.exit(1);
});