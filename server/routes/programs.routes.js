import express from "express";

export default (pool) => {
  const router = express.Router();

  // Add Program
  router.post("/colleges/:collegeId/programs", async (req, res) => {
    try {
      const { name } = req.body;
      const { collegeId } = req.params;
      const [r] = await pool.query(
        "INSERT INTO programs (college_id, name) VALUES (?, ?)",
        [collegeId, name]
      );
      res.json({ id: r.insertId, name, college_id: collegeId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Program
  router.delete("/colleges/:collegeId/programs/:programId", async (req, res) => {
    try {
      await pool.query("DELETE FROM programs WHERE id = ?", [req.params.programId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
