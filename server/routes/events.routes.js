// server/routes/events.routes.js
import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "events");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}${ext || ".jpg"}`);
  },
});
const upload = multer({ storage });

export default function eventsRouterFactory(db) {
  const router = Router();

  // GET /api/events?campus=Bacolor%20(Main%20Campus)
router.get("/", async (req, res) => {
  try {
    const { campusId } = req.query;
    let sql = `
      SELECT e.id, e.title, e.description, DATE_FORMAT(e.date, '%Y-%m-%d') AS date,
             e.time, c.name AS campus, e.venue, e.image_path, e.created_at
      FROM events e
      LEFT JOIN campuses c ON e.campus_id = c.id
    `;
    const params = [];

    if (campusId) {
      sql += " WHERE e.campus_id = ?";
      params.push(campusId);
    }

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("GET /api/events error:", err);
    res.status(500).json({ error: err.message });
  }
});


// server/routes/events.routes.js
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    // 🔎 get campus name from students table
    const [[student]] = await db.query(
      "SELECT campus FROM students WHERE id = ?",
      [studentId]
    );

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const campusName = student.campus;

    // 🧠 match events by campus name instead of ID
    const [rows] = await db.query(
      `SELECT e.id, e.title, e.description, DATE_FORMAT(e.date, '%Y-%m-%d') AS date,
              e.time, c.name AS campus, e.venue, e.image_path, e.created_at
       FROM events e
       LEFT JOIN campuses c ON e.campus_id = c.id
       WHERE c.name = ?`,
      [campusName]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/events/student/:id error:", err);
    res.status(500).json({ error: err.message });
  }
});



  // POST /api/events
 router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { title, description, date, time, campus, venue } = req.body;
    if (!title || !description || !date || !campus || !venue) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const campusId = parseInt(campus, 10); // 👈 ensure number

    const image_path = req.file ? `/uploads/events/${req.file.filename}` : null;

    const [result] = await db.query(
      `INSERT INTO events (title, description, date, time, campus_id, venue, image_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, description, date, time || null, campusId, venue, image_path]
    );

    const [rows] = await db.query(
      `SELECT e.id, e.title, e.description, DATE_FORMAT(e.date, '%Y-%m-%d') AS date,
              e.time, c.name AS campus, e.venue, e.image_path, e.created_at
       FROM events e
       LEFT JOIN campuses c ON e.campus_id = c.id
       WHERE e.id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error("POST /api/events error:", e);
    res.status(500).json({ error: "Failed to create event" });
  }
});


  return router;
}

