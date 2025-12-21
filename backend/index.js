import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";

import { openDb } from "./db.js";
import { nowMs, jsonParseSafe } from "./utils.js";
import { computeScores } from "./score.js";

const PORT = Number(process.env.PORT || 4000);
const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";
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

// ---- Uploads (local) ----
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve uploaded files
app.use("/uploads", express.static(UPLOADS_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || "file")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 140);
      cb(null, `${Date.now()}-${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// ---- Helpers ----
function requireEmail(req, res, next) {
  const email = (req.header("X-Email") || "").toLowerCase().trim();
  if (!email) return res.status(400).json({ error: "Missing X-Email header" });
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

const SubmitSchema = z.object({
  remark: z.string().max(2000).optional().default(""),
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

app.post("/submit", requireEmail, upload.single("file"), (req, res) => {
  // Support multipart/form-data: meta/answers are JSON strings in req.body
  const rawMeta = typeof req.body.meta === "string" ? JSON.parse(req.body.meta || "{}") : (req.body.meta || {});
  const rawAnswers = typeof req.body.answers === "string" ? JSON.parse(req.body.answers || "[]") : (req.body.answers || []);
  const rawRemark = typeof req.body.remark === "string" ? req.body.remark : "";

  const parsed = SubmitSchema.safeParse({ meta: rawMeta, answers: rawAnswers, remark: rawRemark });
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", issues: parsed.error.issues });

  const body = parsed.data;

  const remark_text = (body.remark || "").trim();
  const file_path = req.file ? `/uploads/${req.file.filename}` : null;

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
  let info;
  try {
    info = db.prepare(
      "INSERT INTO submissions(email, meta_json, answers_json, scores_json, remark_text, file_path, created_at) VALUES(?,?,?,?,?,?,?)"
    ).run(req.email, meta_json, answers_json, scores_json, remark_text || null, file_path, created_at);
  } catch {
    // Backward-compatible if DB schema not migrated yet
    info = db.prepare(
      "INSERT INTO submissions(email, meta_json, answers_json, scores_json, created_at) VALUES(?,?,?,?,?)"
    ).run(req.email, meta_json, answers_json, scores_json, created_at);
  }

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
      remark: r.remark_text || "",
      file_path: r.file_path || null,
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
    remark: r.remark_text || "",
    file_path: r.file_path || null,
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on ${PORT}`);
  console.log(`Allowed origin: ${APP_ORIGIN}`);
});
