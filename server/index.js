// server/index.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import cookieParser from "cookie-parser";   // ✅ ADD THIS

import studentsRouter from "./routes/students.routes.js";
import campusesRouterFactory from "./routes/campuses.routes.js";
import eventsRouterFactory from "./routes/events.routes.js";
import yearSectionsRouterFactory from "./routes/yearsections.routes.js";
import usersRouterFactory from "./routes/users.routes.js";
import chatRouterFactory from "./routes/chat.routes.js";
import studentLogRouterFactory from "./routes/studentlog.routes.js";
import programsRoutes from "./routes/programs.routes.js";

dotenv.config();

// ESM dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// MySQL pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "ai_pams",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4_unicode_ci",
});

const app = express();

// Allow only explicitly configured frontend origins (local development + Vercel).
// Set FRONTEND_ORIGINS to a comma-separated list of your deployed frontend URLs.
const allowedFrontendOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:3000,http://localhost:5173")
  .split(",")
  .map((value) => value.trim().replace(/\\/$/, ""))
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedFrontendOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "5mb" }));
app.use(cookieParser()); // ✅ para mabasa/set cookies

// Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/reports", express.static(path.join(__dirname, "reports")));

// Health (ping DB)
app.get("/api/health", async (_req, res) => {
  try {
    const c = await pool.getConnection();
    await c.ping();
    c.release();
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});

// Routes
app.use("/api/students", studentsRouter);
app.use("/api/events", eventsRouterFactory(pool));
app.use("/api/campuses", campusesRouterFactory(pool));
app.use("/api/yearsections", yearSectionsRouterFactory(pool));
app.use("/api/users", usersRouterFactory(pool));
app.use("/api/chat", chatRouterFactory(pool));
app.use("/api/student-logs", studentLogRouterFactory(pool));
app.use("/api", programsRoutes(pool));
app.use(cookieParser());

// ✅ Simple logout route (clear cookie)
app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: false, // set true pag naka HTTPS ka na
  });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`API listening on http://localhost:${PORT}`)
);
