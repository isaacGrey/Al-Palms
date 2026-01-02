// server/routes/studentlog.routes.js
import express from "express";

export default function studentLogRouter(pool) {
  const router = express.Router();

  // ✅ Create new log
  router.post("/", async (req, res) => {
    const { student_id, student_name, action, details } = req.body;
    if (!student_id || !student_name || !action) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    try {
      const [result] = await pool.query(
        "INSERT INTO student_logs (student_id, student_name, action, details) VALUES (?, ?, ?, ?)",
        [student_id, student_name, action, details || ""]
      );
      res.json({ id: result.insertId, student_id, student_name, action, details });
    } catch (err) {
      console.error("Error inserting log:", err);
      res.status(500).json({ error: "Failed to save log" });
    }
  });

  // ✅ Get logs
  router.get("/", async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM student_logs ORDER BY created_at DESC");
      res.json(rows);
    } catch (err) {
      console.error("Error fetching logs:", err);
      res.status(500).json({ error: "Failed to fetch logs" });
    }
  });

  return router;
}
