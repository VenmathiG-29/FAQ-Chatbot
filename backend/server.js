/* server.js -- Full backend for FAQ Chatbot (JWT + refresh + role-based admin + FAQ CRUD + OpenAI fallback) */
const express = require("express");
const fs = require("fs-extra");
const path = require("path");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const OpenAI = require("openai");

const app = express();
app.use(express.json());
app.use(cookieParser());

// load env
const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5000";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access_secret_change_me";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh_secret_change_me";
const ACCESS_EXPIRES = process.env.ACCESS_EXPIRES || "15m";
const REFRESH_EXPIRES = process.env.REFRESH_EXPIRES || "7d";

// OpenAI client (optional)
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// ensure data files in same folder
const DATA_DIR = __dirname;
const FAQS_FILE = path.join(DATA_DIR, "faqs.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const FEEDBACK_FILE = path.join(DATA_DIR, "feedback.txt");
const UNANSWERED_FILE = path.join(DATA_DIR, "unanswered.txt");

// CORS & cookies (allow credentials)
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);

// simple JSON load/save helpers
function loadJson(filePath, defaultVal) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultVal, null, 2));
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8") || "[]");
  } catch (e) {
    console.error("JSON parse error", filePath, e);
    return defaultVal;
  }
}
function saveJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2));
}

// In-memory refresh store (replace with DB/Redis in production)
const refreshStore = new Set();

const signAccess = (payload) => jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
const signRefresh = (payload) => jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES });

// --------- Authentication endpoints ---------

// Helper: get admin record by username
function getAdminByUsername(username) {
  const admins = loadJson(ADMINS_FILE, []);
  return admins.find((a) => a.username === username);
}

// Login: issues access token + refresh cookie
app.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username & password required" });

  const admin = getAdminByUsername(username);
  if (!admin) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const payload = { username: admin.username, role: admin.role };
  const accessToken = signAccess(payload);
  const refreshToken = signRefresh(payload);

  refreshStore.add(refreshToken);

  // set httpOnly cookie (secure, sameSite none for cross-site)
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: FRONTEND_ORIGIN.startsWith("https://"), // secure in prod when using HTTPS
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ token: accessToken, expiresIn: ACCESS_EXPIRES });
});

// Token: exchange refresh cookie for new access token
app.post("/token", (req, res) => {
  const rt = req.cookies.refreshToken;
  if (!rt) return res.status(401).json({ error: "No refresh token" });
  if (!refreshStore.has(rt)) return res.status(403).json({ error: "Revoked refresh token" });

  try {
    const decoded = jwt.verify(rt, REFRESH_SECRET);
    const payload = { username: decoded.username, role: decoded.role || decoded.role };
    const access = signAccess(payload);
    res.json({ token: access, expiresIn: ACCESS_EXPIRES });
  } catch (e) {
    refreshStore.delete(rt);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// Logout: revoke refresh + clear cookie
app.post("/logout", (req, res) => {
  const rt = req.cookies.refreshToken;
  if (rt) refreshStore.delete(rt);
  res.clearCookie("refreshToken", { path: "/", sameSite: "none", secure: true });
  res.json({ status: "logged_out" });
});

// Middleware: auth by access token (Authorization: Bearer <token>)
function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, ACCESS_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}

// Role middleware
function requireRole(...allowed) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const admins = loadJson(ADMINS_FILE, []);
    const me = admins.find((a) => a.username === user.username);
    if (!me) return res.status(401).json({ error: "User not found" });
    if (!allowed.includes(me.role)) return res.status(403).json({ error: "Forbidden — insufficient role" });
    req.me = me;
    next();
  };
}

// --------- Public Chat / FAQ logic ---------

// read faqs on each request (to reflect admin edits immediately)
function matchFaqAnswer(message) {
  const faqs = loadJson(FAQS_FILE, []);
  const q = (message || "").toLowerCase();
  // Simple matching: if first word of stored question is included, return answer.
  for (const f of faqs) {
    const key = (f.question || "").toLowerCase();
    const first = key.split(" ")[0];
    if (!first) continue;
    if (q.includes(first)) return f.answer;
  }
  return null;
}

app.post("/chat", async (req, res) => {
  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message required" });

  // 1) Check local FAQs
  const faqAnswer = matchFaqAnswer(message);
  if (faqAnswer) return res.json({ reply: faqAnswer, source: "faq" });

  // 2) Save unanswered
  fs.appendFileSync(UNANSWERED_FILE, message.trim() + "\n");

  // 3) Try OpenAI fallback (if configured)
  if (openai) {
    try {
      const resp = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: "You are a helpful FAQ assistant. If unsure, say you don't know." },
          { role: "user", content: message }
        ],
        max_tokens: 200
      });
      const answer = resp.choices?.[0]?.message?.content || "Sorry, I couldn't generate an answer.";
      return res.json({ reply: answer, source: "openai" });
    } catch (e) {
      console.error("OpenAI error:", e);
      return res.json({ reply: "⚠️ AI is unavailable. We'll get back to you.", source: "fallback" });
    }
  }

  // 4) If no OpenAI configured
  return res.json({ reply: "🤖 Sorry, I don’t know the answer to that yet.", source: "none" });
});

// Feedback from chat UI (public)
app.post("/feedback", (req, res) => {
  const { question, feedback } = req.body || {};
  fs.appendFileSync(FEEDBACK_FILE, `${(question || "").replace(/\n/g, " ")} - ${(feedback || "")}\n`);
  res.json({ status: "ok" });
});

// --------- Public read route for faqs ---------
app.get("/faqs", (req, res) => {
  const faqs = loadJson(FAQS_FILE, []);
  res.json({ faqs });
});

// --------- Admin FAQ CRUD (editor+) ---------

app.post("/faqs", authMiddleware, requireRole("editor", "admin", "superadmin"), (req, res) => {
  const { question, answer } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: "question & answer required" });
  const faqs = loadJson(FAQS_FILE, []);
  const newFaq = { id: uuidv4(), question: question.trim(), answer: answer.trim() };
  faqs.push(newFaq);
  saveJson(FAQS_FILE, faqs);
  res.json({ ok: true, faq: newFaq });
});

app.put("/faqs/:id", authMiddleware, requireRole("editor", "admin", "superadmin"), (req, res) => {
  const id = req.params.id;
  const { question, answer } = req.body || {};
  const faqs = loadJson(FAQS_FILE, []);
  const idx = faqs.findIndex((f) => f.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (question) faqs[idx].question = question.trim();
  if (answer) faqs[idx].answer = answer.trim();
  saveJson(FAQS_FILE, faqs);
  res.json({ ok: true, faq: faqs[idx] });
});

app.delete("/faqs/:id", authMiddleware, requireRole("admin", "superadmin"), (req, res) => {
  const id = req.params.id;
  const faqs = loadJson(FAQS_FILE, []);
  const newFaqs = faqs.filter((f) => f.id !== id);
  if (newFaqs.length === faqs.length) return res.status(404).json({ error: "Not found" });
  saveJson(FAQS_FILE, newFaqs);
  res.json({ ok: true });
});

// --------- Admin user management (superadmin only) ---------

app.get("/admins", authMiddleware, requireRole("superadmin"), (req, res) => {
  const admins = loadJson(ADMINS_FILE, []);
  res.json({ admins: admins.map(({ passwordHash, ...rest }) => rest) });
});

app.post("/admins", authMiddleware, requireRole("superadmin"), async (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  const admins = loadJson(ADMINS_FILE, []);
  if (admins.some((a) => a.username === username)) return res.status(400).json({ error: "username exists" });
  const passwordHash = await bcrypt.hash(password, 10);
  const newAdmin = { id: uuidv4(), username, passwordHash, role };
  admins.push(newAdmin);
  saveJson(ADMINS_FILE, admins);
  res.json({ ok: true, admin: { id: newAdmin.id, username: newAdmin.username, role: newAdmin.role } });
});

app.put("/admins/:id", authMiddleware, requireRole("superadmin"), async (req, res) => {
  const id = req.params.id;
  const { role, password } = req.body || {};
  const admins = loadJson(ADMINS_FILE, []);
  const idx = admins.findIndex((a) => a.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  if (role) admins[idx].role = role;
  if (password) admins[idx].passwordHash = await bcrypt.hash(password, 10);
  saveJson(ADMINS_FILE, admins);
  res.json({ ok: true });
});

app.delete("/admins/:id", authMiddleware, requireRole("superadmin"), (req, res) => {
  const id = req.params.id;
  let admins = loadJson(ADMINS_FILE, []);
  admins = admins.filter((a) => a.id !== id);
  saveJson(ADMINS_FILE, admins);
  res.json({ ok: true });
});

// --------- Admin: view feedback & unanswered (protected) ---------

app.get("/feedbacks", authMiddleware, requireRole("admin", "superadmin"), (req, res) => {
  const data = fs.existsSync(FEEDBACK_FILE) ? fs.readFileSync(FEEDBACK_FILE, "utf-8").split("\n").filter(Boolean) : [];
  res.json({ feedbacks: data });
});

app.get("/unanswered", authMiddleware, requireRole("admin", "superadmin"), (req, res) => {
  const data = fs.existsSync(UNANSWERED_FILE) ? fs.readFileSync(UNANSWERED_FILE, "utf-8").split("\n").filter(Boolean) : [];
  res.json({ unanswered: data });
});

// Reset logs (admin+)
app.post("/admin/reset-logs", authMiddleware, requireRole("admin", "superadmin"), (req, res) => {
  if (fs.existsSync(FEEDBACK_FILE)) fs.writeFileSync(FEEDBACK_FILE, "");
  if (fs.existsSync(UNANSWERED_FILE)) fs.writeFileSync(UNANSWERED_FILE, "");
  res.json({ status: "cleared" });
});

// Who am I (returns username & role)
app.get("/whoami", authMiddleware, (req, res) => {
  const username = req.user?.username;
  const admins = loadJson(ADMINS_FILE, []);
  const me = admins.find((a) => a.username === username);
  res.json({ username, role: me?.role || null });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
