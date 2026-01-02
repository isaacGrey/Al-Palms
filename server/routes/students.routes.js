// server/routes/students.routes.js
import express from "express";
import bcrypt from "bcryptjs";
import multer from "multer";
import fs from "fs";
import path from "path";
import { pool } from "../db.js";
import jwt from "jsonwebtoken";


const router = express.Router();

// 🔑 Middleware to check JWT in cookie
function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: "Invalid token" });
  }
}


/* ---------- helpers ---------- */
const safeDate = (s) =>
  s && /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s) : null;

const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseGroupAnswers = (row) => {
  if (!row) return row;
  if (row.group_answers) {
    try {
      row.group_answers =
        typeof row.group_answers === "string"
          ? JSON.parse(row.group_answers)
          : JSON.parse(JSON.stringify(row.group_answers));
    } catch {
      // leave as-is if parsing fails
    }
  }
  return row;
};

/* ---------- small util: whitelist fields we allow for uniqueness ---------- */
const UNIQUE_FIELDS = new Set(["name", "studentNumber", "contactNumber", "email"]);
const normalizeField = (f) => (typeof f === "string" ? f.trim() : "");

/* ---------- uploads (multer) ---------- */
const idsDir = path.join(process.cwd(), "uploads", "ids");
if (!fs.existsSync(idsDir)) fs.mkdirSync(idsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, idsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const base = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error("Images only"));
  },
});

/* ---------- GET /api/students (list) ---------- */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, campus, yearSection AS year, college, program, status
FROM students
ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /api/students error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ---------- GET /api/students/check-unique ---------- */
router.get("/check-unique", async (req, res) => {
  try {
    const field = normalizeField(req.query.field);
    const value = String(req.query.value ?? "").trim();

    if (!UNIQUE_FIELDS.has(field)) {
      return res.status(400).json({ ok: false, error: "Invalid field" });
    }
    if (!value) {
      return res.json({ ok: true, unique: true });
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM students WHERE ${field} = ? LIMIT 1`,
      [value]
    );
    const exists = Number(rows?.[0]?.cnt ?? 0) > 0;
    return res.json({ ok: true, unique: !exists });
  } catch (err) {
    console.error("GET /api/students/check-unique error:", err);
    res.status(500).json({ ok: false, error: "Database error" });
  }
});

/* ---------- POST /api/students (create; defaults to PENDING) ---------- */
router.post(
  "/",
  upload.fields([
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "profile", maxCount: 1 }, 
  ]),
  async (req, res) => {
    try {
      const data = req.body || {};
      const files = /** @type {Record<string, any>} */ (req.files) || {};

      const required = [
        "name","studentNumber","contactNumber","address","email",
        "birthday","sex","campus","yearSection","password",
      ];
      for (const k of required) {
        if (!data[k] || String(data[k]).trim() === "") {
          return res.status(400).json({ error: `Missing required field: ${k}` });
        }
      }

      const selectedGroup = String(data.selectedGroup || "").trim();
      const idFrontFile = files?.idFront?.[0] || null;
      const idBackFile  = files?.idBack?.[0]  || null;

      if (selectedGroup && (!idFrontFile || !idBackFile)) {
        return res.status(400).json({ error: "Please attach FRONT and BACK of your ID." });
      }

      const dupChecks = [
        ["name", String(data.name || "").trim()],
        ["studentNumber", String(data.studentNumber || "").trim()],
        ["contactNumber", String(data.contactNumber || "").trim()],
        ["email", String(data.email || "").trim()],
      ].filter(([, v]) => v);

      if (dupChecks.length) {
        const where = dupChecks.map(([f]) => `${f} = ?`).join(" OR ");
        const params = dupChecks.map(([, v]) => v);
        const [rows] = await pool.query(
          `SELECT name, studentNumber, contactNumber, email
             FROM students
            WHERE ${where}
            LIMIT 1`,
          params
        );
        if (rows && rows.length) {
          const r = rows[0];
          for (const [f, v] of dupChecks) {
            if (r[f] === v) {
              return res.status(409).json({ error: `${f} is already registered.` });
            }
          }
          return res.status(409).json({ error: "Duplicate record." });
        }
      }

      const password_hash = await bcrypt.hash(String(data.password), 10);

      const birthday   = safeDate(data.birthday);
      const age        = toNumOrNull(data.age);
      const height     = toNumOrNull(data.height);
      const weight     = toNumOrNull(data.weight);

      const group_type = selectedGroup || "";

      let group_answers = null;
      if (data.groupAnswers !== undefined && data.groupAnswers !== null) {
        try {
          if (typeof data.groupAnswers === "string") {
            JSON.parse(data.groupAnswers);
            group_answers = data.groupAnswers;
          } else {
            group_answers = JSON.stringify(data.groupAnswers);
          }
        } catch {
          group_answers = String(data.groupAnswers);
        }
      }

      const id_front_path = idFrontFile ? `/uploads/ids/${idFrontFile.filename}` : null;
      const id_back_path  = idBackFile  ? `/uploads/ids/${idBackFile.filename}`  : null;
      const profileFile = files?.profile?.[0] || null;
const profile_path = profileFile ? `/uploads/ids/${profileFile.filename}` : null;


   const sql = `
  INSERT INTO students
  (name, studentNumber, contactNumber, address, email,
   birthday, age, sex, citizenship, religion, bloodType,
   height_cm, weight_kg, campus, college, program, yearSection,
   group_type, group_answers, password_hash,
   id_front_path, id_back_path, profile_path,
   status, reviewed_at)
  VALUES (?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,
          ?,?,?,?,?,?,?,?)   -- 25 placeholders
`;

const params = [
  data.name || null,
  data.studentNumber || null,
  data.contactNumber || null,
  data.address || null,
  data.email || null,
  birthday,
  age,
  data.sex || null,
  data.citizenship || null,
  data.religion || null,
  data.bloodType || null,
  height,
  weight,
  data.campus || null,
  data.college || null,
  data.program || null,
  data.yearSection || null,
  group_type,
  group_answers,
  password_hash,
  id_front_path,
  id_back_path,
  profile_path,
  "PENDING",   // status
  null         // reviewed_at
];





      await pool.query(sql, params);
      res.status(201).json({ ok: true });
    } catch (err) {
      if (err && err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ error: "Duplicate value for a unique field." });
      }
      console.error("POST /api/students error:", err);
      if (String(err?.message || "").includes("Images only")) {
        return res.status(400).json({ error: "Images only" });
      }
      res.status(500).json({ error: "Database error" });
    }
  }
);

/* ---------- POST /api/students/auth/login ---------- */
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Missing email or password" });
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, studentNumber, campus, password_hash, status
         FROM students
        WHERE email = ? LIMIT 1`,
      [String(email).trim()]
    );
    const user = rows?.[0];
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.status !== "APPROVED") {
      return res.status(403).json({ error: "Account not approved", status: user.status });
    }

    const ok = await bcrypt.compare(String(password), user.password_hash || "");
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    // 🔑 Create JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // ✅ Send as HttpOnly cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    // Send basic user info
    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        studentNumber: user.studentNumber,
        campus: user.campus,
        status: user.status,
      },
    });
  } catch (err) {
    console.error("POST /api/students/auth/login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});


/* ---------- POST /api/auth/logout ---------- */
router.post("/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.json({ ok: true, message: "Logged out successfully" });
});



/* ---------- PATCH /api/students/:id/status ---------- */
router.patch("/:id(\\d+)/status", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { action } = req.body || {};

    if (action !== "APPROVE" && action !== "REJECT") {
      return res.status(400).json({ error: "Invalid action" });
    }

    const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
    const [result] = await pool.query(
      `UPDATE students SET status = ?, reviewed_at = NOW() WHERE id = ?`,
      [nextStatus, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json({ ok: true, status: nextStatus });
  } catch (err) {
    console.error("PATCH /api/students/:id/status error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ---------- GET /api/students/stats ---------- */
router.get("/stats", async (req, res) => {
  try {
    const { campus } = req.query;
    const isFiltered = campus && campus.trim() !== "";

    // 1️⃣ TOTAL STUDENTS
    const [[{ total }]] = await pool.query(
      isFiltered
        ? `SELECT COUNT(*) AS total FROM students WHERE campus = ?`
        : `SELECT COUNT(*) AS total FROM students`,
      isFiltered ? [campus] : []
    );

    // 2️⃣ BY CAMPUS
    const [byCampusRows] = await pool.query(
      `SELECT campus, COUNT(*) as count
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}
       GROUP BY campus`,
      isFiltered ? [campus] : []
    );
    const byCampus = Object.fromEntries(byCampusRows.map(r => [r.campus, r.count]));

    // 3️⃣ BY YEAR
    const [byYearRows] = await pool.query(
      `SELECT yearSection as year, COUNT(*) as count
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}
       GROUP BY yearSection`,
      isFiltered ? [campus] : []
    );
    const byYear = Object.fromEntries(byYearRows.map(r => [r.year, r.count]));

    // 4️⃣ TOP PROGRAMS
    const [progRows] = await pool.query(
      `SELECT program, COUNT(*) as count
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}
       GROUP BY program
       ORDER BY count DESC
       LIMIT 5`,
      isFiltered ? [campus] : []
    );

    // 5️⃣ BY SEX
    const [sexRows] = await pool.query(
      `SELECT sex, COUNT(*) as count
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}
       GROUP BY sex`,
      isFiltered ? [campus] : []
    );
    const bySex = Object.fromEntries(sexRows.map(r => [r.sex || "N/A", r.count]));

    // 6️⃣ AGE BUCKETS
    const [ageRows] = await pool.query(
      `SELECT 
          SUM(CASE WHEN age < 18 THEN 1 ELSE 0 END) AS under18,
          SUM(CASE WHEN age BETWEEN 18 AND 25 THEN 1 ELSE 0 END) AS age18_25,
          SUM(CASE WHEN age BETWEEN 26 AND 40 THEN 1 ELSE 0 END) AS age26_40,
          SUM(CASE WHEN age > 40 THEN 1 ELSE 0 END) AS over40
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}`,
      isFiltered ? [campus] : []
    );
    const ageBuckets = {
      "<18": ageRows[0].under18,
      "18-25": ageRows[0].age18_25,
      "26-40": ageRows[0].age26_40,
      ">40": ageRows[0].over40,
    };

    // 7️⃣ MONTHLY REGISTRATIONS (LAST 12 MONTHS)
    const [monthRows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as count
       FROM students
       ${isFiltered
         ? "WHERE campus = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)"
         : "WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)"}
       GROUP BY month
       ORDER BY month ASC`,
      isFiltered ? [campus] : []
    );
    const monthlyRegistrations = monthRows;

    // 8️⃣ CAMPUS × SEX
    const [campusSexRows] = await pool.query(
      `SELECT campus, sex, COUNT(*) as count
       FROM students
       ${isFiltered ? "WHERE campus = ?" : ""}
       GROUP BY campus, sex`,
      isFiltered ? [campus] : []
    );
    const byCampusBySex = {};
    for (const row of campusSexRows) {
      if (!byCampusBySex[row.campus]) byCampusBySex[row.campus] = {};
      byCampusBySex[row.campus][row.sex || "N/A"] = row.count;
    }

    // 9️⃣ AFFIRMATIVE GROUP TOTALS (Campus-aware)
    const [groupRows] = await pool.query(
      `SELECT campus, group_type, COUNT(*) as count
       FROM students
       WHERE group_type IS NOT NULL AND group_type != ''
       ${isFiltered ? "AND campus = ?" : ""}
       GROUP BY campus, group_type`,
      isFiltered ? [campus] : []
    );

    const groupTotals = {};
    const groupTotalsByCampus = {};
    for (const r of groupRows) {
      const gt = r.group_type.toUpperCase();
      if (!groupTotalsByCampus[r.campus]) groupTotalsByCampus[r.campus] = {};
      groupTotalsByCampus[r.campus][gt] = r.count;
      groupTotals[gt] = (groupTotals[gt] || 0) + r.count;
    }

    // 🔟 AFFIRMATIVE GROUP MONTHLY TRENDS
    const [trendRows] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month, group_type, COUNT(*) as count
       FROM students
       WHERE group_type IS NOT NULL AND group_type != ''
       ${isFiltered ? "AND campus = ?" : ""}
       GROUP BY month, group_type
       ORDER BY month ASC`,
      isFiltered ? [campus] : []
    );
    const monthMap = {};
    for (const r of trendRows) {
      if (!monthMap[r.month]) {
        monthMap[r.month] = { month: r.month, IPS: 0, PWD: 0, SOLO_PARENT: 0 };
      }
      if (r.group_type && monthMap[r.month][r.group_type] !== undefined) {
        monthMap[r.month][r.group_type] = r.count;
      }
    }

    const groupMonthlyTrends = Object.values(monthMap);

    // 🧩 Return unified format
    res.json({
      campus: isFiltered ? campus : "All Campuses",
      total,
      byCampus,
      byYear,
      topPrograms: progRows,
      bySex,
      ageBuckets,
      monthlyRegistrations,
      byCampusBySex,
      groupTotals,
      groupTotalsByCampus,
      groupMonthlyTrends,
    });
  } catch (err) {
    console.error("GET /api/students/stats error:", err);
    res.status(500).json({ error: "Database error" });
  }
});



// GET /api/students/me/full → return ALL fields of the logged-in student
router.get("/me/full", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM students WHERE id = ? LIMIT 1`,
      [req.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(parseGroupAnswers(rows[0])); // ✅ returns all fields
  } catch (err) {
    console.error("GET /api/students/me/full error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// GET /api/students/full → returns ALL student records with complete info
router.get("/full/all", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM students ORDER BY id DESC");
    res.json(rows.map(parseGroupAnswers));
  } catch (err) {
    console.error("GET /api/students/full/all error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


/* ---------- GET /api/students/me ---------- */
/* ---------- GET /api/students/me (cookie-based) ---------- */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, studentNumber, campus, status
       FROM students
       WHERE id = ? LIMIT 1`,
      [req.user.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("GET /api/students/me error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


/* ---------- GET /api/students/me/:email ---------- */
router.get("/me/:email", async (req, res) => {
  try {
    const email = decodeURIComponent(String(req.params.email || "")).trim();
    if (!email) return res.status(400).json({ error: "Missing email" });

    const [rows] = await pool.query(`SELECT * FROM students WHERE email = ? LIMIT 1`, [email]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(parseGroupAnswers(rows[0]));
  } catch (err) {
    console.error("GET /api/students/me/:email error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/* ---------- GET /api/students/:id ---------- */
router.get("/:id(\\d+)", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(`SELECT * FROM students WHERE id = ?`, [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Not found" });
    res.json(parseGroupAnswers(rows[0]));
  } catch (err) {
    console.error("GET /api/students/:id error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


// PATCH /api/students/:id (update student profile)
router.patch("/:id(\\d+)", upload.single("profile"), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { contactNumber, email, address, sex, birthday, password } = req.body;

    let profile_path = null;
    if (req.file) {
      profile_path = `/uploads/ids/${req.file.filename}`;
    }

    let password_hash = null;
    if (password) {
      password_hash = await bcrypt.hash(String(password), 10);
    }

    const fields = [];
    const params = [];

    if (contactNumber !== undefined) { fields.push("contactNumber=?"); params.push(contactNumber); }
    if (email !== undefined) { fields.push("email=?"); params.push(email); }
    if (address !== undefined) { fields.push("address=?"); params.push(address); }
    if (sex !== undefined) { fields.push("sex=?"); params.push(sex); }
    if (birthday !== undefined) { fields.push("birthday=?"); params.push(safeDate(birthday)); }
    if (profile_path) { fields.push("profile_path=?"); params.push(profile_path); }
    if (password_hash) { fields.push("password_hash=?"); params.push(password_hash); }

    if (!fields.length) return res.status(400).json({ error: "No fields to update" });

    params.push(id);
    const sql = `UPDATE students SET ${fields.join(", ")} WHERE id=?`;
    await pool.query(sql, params);

    res.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/students/:id error:", err);
    res.status(500).json({ error: "Database error" });
  }
});


/* ---------- EXPORT ROUTER ---------- */
export default router;
