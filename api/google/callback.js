import { timingSafeEqual } from "node:crypto";

const CLIENT_SESSION_KEY = "commission_google_drive_session_v1";
const RETURN_KEY = "commission_google_drive_return_v1";
const RESULT_KEY = "commission_google_drive_result_v1";
const safeJson = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
const cookies = (header = "") => Object.fromEntries(header.split(";").map(v => v.trim().split(/=(.*)/s).slice(0,2)));

function returnToApp(res, payload) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'nonce-commission-oauth'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  // Callback page and SPA are same-origin, so sessionStorage is shared.
  const data = safeJson(payload);
  res.status(200).end(`<!doctype html><html><head><meta charset="utf-8"><title>Google Drive authorization</title></head><body><p>Completing Google Drive authorization…</p><script nonce="commission-oauth">
try {
  const result = ${data};
  if (result.access_token) {
    sessionStorage.setItem(${JSON.stringify(CLIENT_SESSION_KEY)}, JSON.stringify(result));
    sessionStorage.setItem(${JSON.stringify(RESULT_KEY)}, JSON.stringify({success:true}));
  } else {
    sessionStorage.setItem(${JSON.stringify(RESULT_KEY)}, JSON.stringify({error:result.error || 'Authorization failed'}));
  }
  const destination = sessionStorage.getItem(${JSON.stringify(RETURN_KEY)}) || '/';
  sessionStorage.removeItem(${JSON.stringify(RETURN_KEY)});
  location.replace(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/');
} catch (e) { document.body.textContent = 'Google authorization could not be completed: ' + e.message; }
</script></body></html>`);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method not allowed");
  const cookie = cookies(req.headers.cookie)["commission_oauth_state"] || "";
  res.setHeader("Set-Cookie", "commission_oauth_state=; Secure; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=0");
  const state = String(req.query.state || "");
  if (!cookie || !state || cookie.length !== state.length || !timingSafeEqual(Buffer.from(cookie), Buffer.from(state))) {
    return returnToApp(res, { error: "OAuth security state mismatch or expired. Please reconnect." });
  }
  if (req.query.error) return returnToApp(res, { error: `Google authorization: ${String(req.query.error)}` });
  if (!req.query.code) return returnToApp(res, { error: "Google did not return an authorization code." });
  try {
    // Must be identical to the redirect_uri sent by start.js, including scheme.
    const protocol = req.headers["x-forwarded-proto"] === "http" ? "http" : "https";
    const redirectUri = `${protocol}://${req.headers.host}/api/google/callback`;
    const exchange = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const token = await exchange.json();
    if (!exchange.ok || !token.access_token) throw new Error([token.error, token.error_description].filter(Boolean).join(": ") || `Token exchange HTTP ${exchange.status}`);
    const expiry = Date.now() + Math.max(1, Number(token.expires_in) || 3600) * 1000 - 60000;
    return returnToApp(res, { access_token: token.access_token, expiry, scope: token.scope || "" });
  } catch (e) {
    return returnToApp(res, { error: `Google token exchange failed: ${e.message}` });
  }
}
