import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { openDb } from "./db.js";
import { nowMs, sha256, genOtp6, jsonParseSafe } from "./utils.js";
import { sendOtpEmail } from "./mailer.js";
import { computeScores } from "./score.js";

const PORT = Number(process.env.PORT || 4000);
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";
const OTP_TTL_MINUTES = Number(process.env.OTP_TTL_MINUTES || 10);
const OTP_RATE_LIMIT_PER_HOUR = Number(process.env.OTP_RATE_LIMIT_PER_HOUR || 8);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-me";

const app = express();
const db = openDb();

app.use(cors({ origin: APP_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

// ---- Load Questions Template ----
const QUESTIONS_PATH = path.join(process.cwd(), "data", "questions.json");
function loadQuestions() {
  const raw = fs.readFileSync(QUESTIONS_PATH, "utf-8");
  return JSON.parse(raw);
}
let QUESTIONS = loadQuestions();

// Hot reload questions in dev when file changes (optional)
fs.watch(path.dirname(QUESTIONS_PATH), { persistent: false }, () => {
  try { QUESTIONS = loadQuestions(); } catch {}
});

// ---- Helpers ----
function requireVerifiedEmail(req, res, next) {
  const email = req.header("X-Email");
  if (!email) return res.status(400).json({ error: "Missing X-Email header" });

  // latest otp for email must be verified and not expired
  const row = db.prepare(
    "SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1"
  ).get(email);

  if (!row) return res.status(401).json({ error: "OTP not requested for this email" });
  if (!row.verified_at) return res.status(401).json({ error: "Email not verified" });
  if (row.expires_at < nowMs()) return res.status(401).json({ error: "OTP expired" });

  req.email = email;
  next();
}

function adminAuth(req, res, next) {
  const h = req.header("Authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// ---- Public ----
app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get("/questions", (_req, res) => {
  res.json({ questions: QUESTIONS });
});

const SendOtpSchema = z.object({ email: z.string().email() });
app.post("/otp/send", (req, res) => {
  const parsed = SendOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid email", issues: parsed.error.issues });

  const email = parsed.data.email.toLowerCase().trim();

  // rate limit: count in last hour
  const oneHourAgo = nowMs() - 60 * 60 * 1000;
  const cnt = db.prepare("SELECT COUNT(*) as c FROM otp_codes WHERE email=? AND created_at>=?").get(email, oneHourAgo).c;
  if (cnt >= OTP_RATE_LIMIT_PER_HOUR) {
    return res.status(429).json({ error: "Too many OTP requests. Please try later." });
  }

  const code = genOtp6();
  const code_hash = sha256(code);
  const created_at = nowMs();
  const expires_at = created_at + OTP_TTL_MINUTES * 60 * 1000;

  db.prepare("INSERT INTO otp_codes(email, code_hash, created_at, expires_at) VALUES(?,?,?,?)")
    .run(email, code_hash, created_at, expires_at);

  // respond quickly, send mail async
  res.json({ ok: true, message: "OTP sent" });

  setImmediate(async () => {
    try {
      await sendOtpEmail({ to: email, code });
    } catch (e) {
      console.error("OTP email send failed:", e?.message || e);
    }
  });
});

const VerifyOtpSchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(10) });
app.post("/otp/verify", (req, res) => {
  const parsed = VerifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });

  const email = parsed.data.email.toLowerCase().trim();
  const otp = parsed.data.otp.trim();

  const row = db.prepare("SELECT * FROM otp_codes WHERE email=? ORDER BY created_at DESC LIMIT 1").get(email);
  if (!row) return res.status(400).json({ error: "OTP not found, please request again." });
  if (row.expires_at < nowMs()) return res.status(400).json({ error: "OTP expired, please request again." });
  if (row.verified_at) return res.json({ ok: true, message: "Already verified" });

  if (row.attempts >= 6) return res.status(429).json({ error: "Too many attempts. Request a new OTP." });

  const ok = sha256(otp) === row.code_hash;
  db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id=?").run(row.id);

  if (!ok) return res.status(400).json({ error: "Invalid OTP" });

  db.prepare("UPDATE otp_codes SET verified_at=? WHERE id=?").run(nowMs(), row.id);
  res.json({ ok: true, message: "Verified" });
});

const SubmitSchema = z.object({
  meta: z.object({
    vessel: z.string().optional().default(""),
    customerOwner: z.string().optional().default(""),
    contact: z.string().optional().default(""),
    position: z.string().optional().default(""),
  }).passthrough(),
  answers: z.array(z.object({
    code: z.string().min(1),
    relevant: z.boolean(),
    importance: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
    satisfaction: z.number().int().min(0).max(5).optional(),
  })),
});

app.post("/submit", requireVerifiedEmail, (req, res) => {
  const parsed = SubmitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });

  const body = parsed.data;

  // Enforce 1 submission per email
  const existing = db.prepare("SELECT id FROM submissions WHERE email=? LIMIT 1").get(req.email);
  if (existing) return res.status(409).json({ error: "Submission already exists for this email." });

  for (const a of body.answers) {
    if (a.relevant && (!a.importance || a.satisfaction === undefined || a.satisfaction === null)) {
      return res.status(400).json({ error: `Missing importance/satisfaction for ${a.code}` });
    }
  }

  const scores = computeScores(QUESTIONS, body.answers);

  // Safety: never show 0% from empty totals unless genuinely no relevant answers
  // (frontend defaults are relevant=true, so totalMax should not be 0)
  const meta_json = JSON.stringify(body.meta || {});
  const answers_json = JSON.stringify(body.answers || []);
  const scores_json = JSON.stringify(scores);

  const created_at = nowMs();
  const info = db.prepare(
    "INSERT INTO submissions(email, meta_json, answers_json, scores_json, created_at) VALUES(?,?,?,?,?)"
  ).run(req.email, meta_json, answers_json, scores_json, created_at);

  res.json({ ok: true, id: info.lastInsertRowid, scores });
});

// ---- Admin ----
const AdminLoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

app.post("/admin/login", (req, res) => {
  const parsed = AdminLoginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { email, password } = parsed.data;
  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase() || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ role: "admin", email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ ok: true, token });
});

app.get("/admin/submissions", adminAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 500").all();
  const items = rows.map((r) => {
    const scores = jsonParseSafe(r.scores_json, {});
    return {
      id: r.id,
      email: r.email,
      created_at: r.created_at,
      scores,
      meta: jsonParseSafe(r.meta_json, {}),
    };
  });
  res.json({ items });
});

app.get("/admin/submissions/:id", adminAuth, (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare("SELECT * FROM submissions WHERE id=?").get(id);
  if (!r) return res.status(404).json({ error: "Not found" });
  res.json({
    id: r.id,
    email: r.email,
    created_at: r.created_at,
    meta: jsonParseSafe(r.meta_json, {}),
    answers: jsonParseSafe(r.answers_json, []),
    scores: jsonParseSafe(r.scores_json, {}),
    questions: QUESTIONS,
  });
});

app.get("/admin/stats", adminAuth, (_req, res) => {
  const rows = db.prepare("SELECT scores_json, created_at FROM submissions ORDER BY created_at ASC").all();
  const series = rows.map((r) => {
    const scores = jsonParseSafe(r.scores_json, {});
    return { t: r.created_at, overall: scores.overall || 0, onboard: scores.onboard || 0, ashore: scores.ashore || 0 };
  });
  res.json({ series });
});

app.listen(PORT, () => {
  console.log(`Backend running on ${PORT}`);
  console.log(`Allowed origin: ${APP_ORIGIN}`);
});
