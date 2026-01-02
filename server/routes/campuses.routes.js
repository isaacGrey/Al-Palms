import express from "express";
export default (pool) => {
  const router = express.Router();
  
// Get all campuses with colleges and programs
router.get("/", async (_req, res) => {
  try {
    const [campuses] = await pool.query("SELECT * FROM campuses");
    const [colleges] = await pool.query("SELECT * FROM colleges");
    const [programs] = await pool.query("SELECT * FROM programs");

    const result = campuses.map((campus) => ({
      ...campus,
      colleges: colleges
        .filter((col) => col.campus_id === campus.id)
        .map((college) => ({
          ...college,
          programs: programs.filter((p) => p.college_id === college.id),
        })),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


  // Add campus
  router.post("/", async (req, res) => {
    try {
      const { name } = req.body;
      const [r] = await pool.query("INSERT INTO campuses (name) VALUES (?)", [name]);
      res.json({ id: r.insertId, name, colleges: [] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// Delete campus
router.delete("/:id", async (req, res) => {
  const campusId = req.params.id;
  try {
    // Option 1: Delete related events first
    await pool.query("DELETE FROM events WHERE campus_id = ?", [campusId]);

    // Then delete campus
    await pool.query("DELETE FROM campuses WHERE id = ?", [campusId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


  // Add college to campus
  router.post("/:id/colleges", async (req, res) => {
    try {
      const { name } = req.body;
      const campusId = req.params.id;
      const [r] = await pool.query(
        "INSERT INTO colleges (campus_id, name) VALUES (?, ?)",
        [campusId, name]
      );
      res.json({ id: r.insertId, name, campus_id: campusId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete college
  router.delete("/:campusId/colleges/:collegeId", async (req, res) => {
    try {
      await pool.query("DELETE FROM colleges WHERE id = ?", [req.params.collegeId]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
