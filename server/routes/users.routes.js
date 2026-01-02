// routes/users.routes.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key";

export default (pool) => {
  const router = express.Router();

  // ✅ AUTH middleware
  function auth(req, res, next) {
    const header = req.headers["authorization"];
    if (!header) return res.status(401).json({ error: "Missing token" });

    const token = header.split(" ")[1];
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // ✅ Admin Login
  router.post("/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const [rows] = await pool.query(
        `SELECT u.id, u.username, u.email, u.password, u.role, c.name as campus
         FROM campus_users u
         JOIN campuses c ON u.campus_id = c.id
         WHERE u.username = ?`,
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ error: "Invalid username" });
      }

      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        return res.status(401).json({ error: "Invalid password" });
      }

      // ✅ Issue JWT with role
      const token = jwt.sign(
        { id: user.id, username: user.username, campus: user.campus, role: user.role },
        JWT_SECRET,
        { expiresIn: "2h" }
      );

      res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          campus: user.campus,
          role: user.role,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ✅ Get all users (protected)
  router.get("/", auth, async (_req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.username, u.email, u.role, c.name as campus
         FROM campus_users u
         JOIN campuses c ON u.campus_id = c.id
         ORDER BY u.id DESC`
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });


  // ✅ Create new user (Only SUPER_ADMIN can create SUPER_ADMIN)
router.post("/", auth, async (req, res) => {
  try {
    const { username, email, password, campus_id, role } = req.body;

    if (!username || !email || !password || !campus_id) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // 🚨 Only SUPER_ADMIN can create another SUPER_ADMIN
    if (role === "SUPER_ADMIN" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Only SUPER_ADMIN can create another SUPER_ADMIN" });
    }

    await pool.query(
      "INSERT INTO campus_users (username, email, password, campus_id, role) VALUES (?, ?, ?, ?, ?)",
      [username, email, hashed, campus_id, role || "CAMPUS_ADMIN"]
    );

    // fetch updated list
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, c.name as campus
       FROM campus_users u
       JOIN campuses c ON u.campus_id = c.id
       ORDER BY u.id DESC`
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



  // ✅ Update user
router.put("/:id", auth, async (req, res) => {
  try {
    const { username, email, password, campus_id, role } = req.body;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      await pool.query(
        "UPDATE campus_users SET username=?, email=?, password=?, campus_id=?, role=? WHERE id=?",
        [username, email, hashed, campus_id, role, req.params.id]
      );
    } else {
      await pool.query(
        "UPDATE campus_users SET username=?, email=?, campus_id=?, role=? WHERE id=?",
        [username, email, campus_id, role, req.params.id]
      );
    }

    // return updated list
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, c.name as campus
       FROM campus_users u
       JOIN campuses c ON u.campus_id = c.id
       ORDER BY u.id DESC`
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


  // ✅ Delete user (cannot delete Bacolor main admin)
router.delete("/:id", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, c.name as campus 
       FROM campus_users u 
       JOIN campuses c ON u.campus_id = c.id 
       WHERE u.id=?`,
      [req.params.id]
    );

    if (rows.length && rows[0].campus === "Bacolor (Main Campus)") {
      return res.status(403).json({ error: "Cannot delete Bacolor admin account" });
    }

    await pool.query("DELETE FROM campus_users WHERE id=?", [req.params.id]);

    // return updated list
    const [newRows] = await pool.query(
      `SELECT u.id, u.username, u.email, u.role, c.name as campus
       FROM campus_users u
       JOIN campuses c ON u.campus_id = c.id
       ORDER BY u.id DESC`
    );

    res.json(newRows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  return router;
};
