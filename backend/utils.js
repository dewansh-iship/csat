import crypto from "node:crypto";

export function nowMs() { return Date.now(); }

export function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

export function genOtp6() {
  // numeric 6 digits
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function jsonParseSafe(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}
