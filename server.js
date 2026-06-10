const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = Number(process.env.PORT || 4173);
const root = __dirname;
const adminToken = process.env.ADMIN_TOKEN || "miqyas-8N4k2Q7p";
const adminRoute = `/admin/${encodeURIComponent(adminToken)}`;
const dataDir = path.join(process.env.VERCEL ? "/tmp" : root, "data");
const dataFile = path.join(dataDir, "analytics.json");
const allowedEvents = new Set(["student_register", "session_start", "page_view", "exam_start", "exam_complete", "feedback_submit"]);
const publicFiles = new Set(["index.html", "styles.css", "questions.js", "app.js", "admin.css", "admin.js"]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp3": "audio/mpeg"
};

function emptyData() {
  return { version: 1, students: {}, events: [] };
}

function loadData() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return emptyData();
  }
}

function saveData(data) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
  fs.renameSync(tempFile, dataFile);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 800000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function cleanText(value, max = 80) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}

function cleanMeta(type, meta = {}) {
  if (type === "feedback_submit") {
    const allowedCategories = new Set(["suggestion", "problem", "question", "content", "other"]);
    const category = cleanText(meta.category, 20);
    const message = cleanText(meta.message, 500).replace(/\s+/g, " ");
    if (message.length < 3) throw new Error("Feedback is too short");
    return { category: allowedCategories.has(category) ? category : "other", message };
  }
  if (type === "exam_start") {
    return {
      title: cleanText(meta.title, 100),
      kind: cleanText(meta.kind, 30),
      unit: Number(meta.unit) || null,
      total: Math.max(0, Number(meta.total) || 0)
    };
  }
  if (type === "exam_complete") {
    return {
      title: cleanText(meta.title, 100),
      kind: cleanText(meta.kind, 30),
      unit: Number(meta.unit) || null,
      score: Math.max(0, Math.min(100, Number(meta.score) || 0)),
      total: Math.max(0, Number(meta.total) || 0),
      correct: Math.max(0, Number(meta.correct) || 0),
      duration: Math.max(0, Number(meta.duration) || 0),
      answers: Array.isArray(meta.answers) ? meta.answers.slice(0, 60).map(answer => ({
        unit: Math.max(1, Math.min(8, Number(answer.unit) || 1)),
        skill: cleanText(answer.skill, 30),
        correct: Boolean(answer.correct)
      })) : []
    };
  }
  return {};
}

function recordEvent(payload) {
  const type = cleanText(payload.type, 30);
  const studentId = cleanText(payload.studentId, 80);
  if (!allowedEvents.has(type) || !/^[a-zA-Z0-9-]{8,80}$/.test(studentId)) {
    throw new Error("Invalid event");
  }

  const now = new Date().toISOString();
  const name = cleanText(payload.name, 40) || "طالب";
  const event = {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    studentId,
    name,
    page: cleanText(payload.page, 40),
    sessionId: cleanText(payload.sessionId, 80),
    at: now,
    meta: cleanMeta(type, payload.meta)
  };

  const data = loadData();
  const student = data.students[studentId] || {
    id: studentId,
    name,
    firstSeen: now,
    lastSeen: now,
    sessions: 0,
    pageViews: 0,
    examStarts: 0,
    examCompletions: 0,
    totalScore: 0,
    totalCorrect: 0,
    totalQuestions: 0
  };

  student.name = name;
  student.lastSeen = now;
  if (type === "session_start") student.sessions += 1;
  if (type === "page_view") {
    student.pageViews += 1;
    student.lastPage = event.page;
  }
  if (type === "exam_start") student.examStarts += 1;
  if (type === "exam_complete") {
    student.examCompletions += 1;
    student.totalScore += event.meta.score;
    student.totalCorrect += event.meta.correct;
    student.totalQuestions += event.meta.total;
    student.lastScore = event.meta.score;
  }

  data.students[studentId] = student;
  data.events.push(event);
  data.events = data.events.slice(-12000);
  saveData(data);
}

function aggregateCounts(items, keyFn) {
  const result = {};
  items.forEach(item => {
    const key = keyFn(item);
    if (key) result[key] = (result[key] || 0) + 1;
  });
  return Object.entries(result).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
}

function buildSummary() {
  const data = loadData();
  const students = Object.values(data.students);
  const events = data.events;
  const now = Date.now();
  const dayMs = 86400000;
  const completions = events.filter(event => event.type === "exam_complete");
  const starts = events.filter(event => event.type === "exam_start");
  const pageViews = events.filter(event => event.type === "page_view");
  const sessions = events.filter(event => event.type === "session_start");
  const feedback = events.filter(event => event.type === "feedback_submit");
  const totalScore = completions.reduce((sum, event) => sum + event.meta.score, 0);

  const unitPerformance = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [index + 1, { correct: 0, total: 0, score: 0 }]));
  const skillPerformance = {};
  completions.forEach(event => (event.meta.answers || []).forEach(answer => {
    unitPerformance[answer.unit].total += 1;
    if (answer.correct) unitPerformance[answer.unit].correct += 1;
    skillPerformance[answer.skill] ||= { correct: 0, total: 0, score: 0 };
    skillPerformance[answer.skill].total += 1;
    if (answer.correct) skillPerformance[answer.skill].correct += 1;
  }));
  Object.values(unitPerformance).forEach(item => item.score = item.total ? Math.round(item.correct / item.total * 100) : 0);
  Object.values(skillPerformance).forEach(item => item.score = item.total ? Math.round(item.correct / item.total * 100) : 0);

  const daily = Array.from({ length: 14 }, (_, offset) => {
    const date = new Date(now - (13 - offset) * dayMs);
    const key = date.toISOString().slice(0, 10);
    const dayEvents = events.filter(event => event.at.slice(0, 10) === key);
    const dayCompletions = dayEvents.filter(event => event.type === "exam_complete");
    return {
      date: key,
      visitors: new Set(dayEvents.map(event => event.studentId)).size,
      pageViews: dayEvents.filter(event => event.type === "page_view").length,
      attempts: dayCompletions.length,
      averageScore: dayCompletions.length ? Math.round(dayCompletions.reduce((sum, event) => sum + event.meta.score, 0) / dayCompletions.length) : 0
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    adminRoute,
    overview: {
      students: students.length,
      activeToday: students.filter(student => now - new Date(student.lastSeen).getTime() < dayMs).length,
      activeWeek: students.filter(student => now - new Date(student.lastSeen).getTime() < 7 * dayMs).length,
      sessions: sessions.length,
      pageViews: pageViews.length,
      feedback: feedback.length,
      examStarts: starts.length,
      examCompletions: completions.length,
      completionRate: starts.length ? Math.round(completions.length / starts.length * 100) : 0,
      averageScore: completions.length ? Math.round(totalScore / completions.length) : 0
    },
    popularPages: aggregateCounts(pageViews, event => event.page),
    popularExams: aggregateCounts(starts, event => event.meta.title),
    unitPerformance,
    skillPerformance,
    daily,
    recentFeedback: feedback.slice(-30).reverse().map(event => ({
      id: event.id,
      name: event.name,
      category: event.meta.category,
      message: event.meta.message,
      page: event.page,
      at: event.at
    })),
    recentAttempts: completions.slice(-12).reverse().map(event => ({
      name: event.name,
      title: event.meta.title,
      score: event.meta.score,
      correct: event.meta.correct,
      total: event.meta.total,
      at: event.at
    })),
    recentStudents: students.sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).slice(0, 12).map(student => ({
      name: student.name,
      lastSeen: student.lastSeen,
      sessions: student.sessions,
      pageViews: student.pageViews,
      attempts: student.examCompletions,
      averageScore: student.examCompletions ? Math.round(student.totalScore / student.examCompletions) : 0
    }))
  };
}

function serveFile(res, fileName) {
  const filePath = path.join(root, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": fileName.endsWith(".html") ? "no-cache" : "public, max-age=300"
    });
    res.end(content);
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
  const requestPath = decodeURIComponent(url.pathname);

  if (req.method === "POST" && requestPath === "/api/track") {
    try {
      recordEvent(await readJson(req));
      sendJson(res, 202, { ok: true });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && requestPath === "/api/admin/summary") {
    if (url.searchParams.get("token") !== adminToken) {
      sendJson(res, 403, { error: "Forbidden" });
      return;
    }
    sendJson(res, 200, buildSummary());
    return;
  }

  if (req.method === "GET" && requestPath === adminRoute) {
    serveFile(res, "admin.html");
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end("Method not allowed");
    return;
  }

  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const isAsset = relative.startsWith("assets/") && !relative.includes("..");
  if (!publicFiles.has(relative) && !isAsset) {
    res.writeHead(404).end("Not found");
    return;
  }
  serveFile(res, relative);
}

if (require.main === module) {
  http.createServer(handleRequest).listen(port, process.env.HOST || "0.0.0.0", () => {
    console.log(`Miqyas is running at http://127.0.0.1:${port}`);
    console.log(`Admin dashboard: http://127.0.0.1:${port}${adminRoute}`);
  });
}

module.exports = handleRequest;
