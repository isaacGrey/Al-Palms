import express from "express";

export default (pool) => {
  const router = express.Router();

  // 🔹 Get all year sections
  router.get("/", async (_req, res) => {
    try {
      const [rows] = await pool.query("SELECT * FROM year_sections");
      res.json(Array.isArray(rows) ? rows : []);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 🔹 Add year section
  router.post("/", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "Name required" });

      const [result] = await pool.query(
        "INSERT INTO year_sections (name) VALUES (?)",
        [name]
      );

      res.json({ id: result.insertId, name });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 🔹 Delete year section
  router.delete("/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query("DELETE FROM year_sections WHERE id = ?", [id]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
