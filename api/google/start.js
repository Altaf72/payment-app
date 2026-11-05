import { randomBytes } from "node:crypto";

export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end("Method not allowed");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return res.status(500).send("Google OAuth environment variables are missing.");
  const state = randomBytes(32).toString("hex");
  const secure = "Secure; HttpOnly; SameSite=Lax; Path=/api/google; Max-Age=600";
  res.setHeader("Set-Cookie", `commission_oauth_state=${state}; ${secure}`);
  res.setHeader("Cache-Control", "no-store");
  const callback = `${req.headers["x-forwarded-proto"] === "http" ? "http" : "https"}://${req.headers.host}/api/google/callback`;
  // The callback must exactly match the authorized redirect URI in Google Cloud.
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account consent");
  res.redirect(302, url.toString());
}
