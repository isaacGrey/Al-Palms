// server/routes/chat.routes.js
import express from "express";
import fetch from "node-fetch"; // Ollama API
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (pool) => {
  const router = express.Router();

  router.post("/", async (req, res) => {
    try {
      const { message } = req.body;
      if (!message) return res.status(400).json({ error: "Message is required" });

      const lower = message.toLowerCase();

      // 🏫 Quick reports
      if (lower.includes("download") && lower.includes("pdf")) {
        let rows, filePath, title, headers;

 if (lower.includes("student")) {
  const [data] = await pool.query(`
    SELECT 
      campus,
      COUNT(*) AS total_students,
      SUM(CASE WHEN group_type = 'PWD' THEN 1 ELSE 0 END) AS PWD,
      SUM(CASE WHEN group_type = 'IPS' THEN 1 ELSE 0 END) AS IPS,
      SUM(CASE WHEN group_type = 'SOLO_PARENT' THEN 1 ELSE 0 END) AS SOLO_PARENT,
      SUM(CASE WHEN sex = 'FEMALE' THEN 1 ELSE 0 END) AS FEMALE,
      SUM(CASE WHEN sex = 'MALE' THEN 1 ELSE 0 END) AS MALE
    FROM students
    GROUP BY campus
  `);

  const rows = data.map(r => ({
    campus: r.campus,
    total_students: Number(r.total_students) || 0,
    PWD: Number(r.PWD) || 0,
    IPS: Number(r.IPS) || 0,
    SOLO_PARENT: Number(r.SOLO_PARENT) || 0,
    FEMALE: Number(r.FEMALE) || 0,
    MALE: Number(r.MALE) || 0,
  }));

  const filePath = path.join(__dirname, "../reports/students-report.pdf");
  const title = "Student Report by Campus";

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(filePath));

  // Title
  doc.fontSize(18).text(title, { align: "center" }).moveDown(2);

  // Table layout
  const startX = 40;
  let startY = 120;
  const colWidths = [100, 80, 60, 60, 80, 60, 60]; // Campus, Total, PWD, IPS, Solo, Female, Male
  const rowHeight = 25;

  // Header row
  doc.rect(startX, startY, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill("#5271FF");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(10);

  const headers = ["Campus", "Total Students", "PWD", "IP's", "Solo Parent", "Female", "Male"];
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
    x += colWidths[i];
  });

  // Rows
  startY += rowHeight;
  doc.font("Helvetica").fontSize(10);
  rows.forEach((r, idx) => {
    const bg = idx % 2 === 0 ? "#FFFFFF" : "#F9F9F9";
    doc.fillColor(bg).rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill();
    doc.fillColor("black");

    let borderX = startX;
    colWidths.forEach(w => { doc.rect(borderX, startY, w, rowHeight).stroke(); borderX += w; });

    const vals = [r.campus, r.total_students, r.PWD, r.IPS, r.SOLO_PARENT, r.FEMALE, r.MALE];
    let tx = startX;
    vals.forEach((v, i) => {
      doc.text(String(v), tx + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
      tx += colWidths[i];
    });

    startY += rowHeight;
  });

  // Totals row
  const totals = {
    total_students: rows.reduce((s,r)=>s+r.total_students,0),
    PWD: rows.reduce((s,r)=>s+r.PWD,0),
    IPS: rows.reduce((s,r)=>s+r.IPS,0),
    SOLO_PARENT: rows.reduce((s,r)=>s+r.SOLO_PARENT,0),
    FEMALE: rows.reduce((s,r)=>s+r.FEMALE,0),
    MALE: rows.reduce((s,r)=>s+r.MALE,0),
  };

  doc.fillColor("#E6E6E6").rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill();
  doc.fillColor("black").font("Helvetica-Bold");

  let tx2 = startX;
  const totalVals = ["TOTAL", totals.total_students, totals.PWD, totals.IPS, totals.SOLO_PARENT, totals.FEMALE, totals.MALE];
  totalVals.forEach((v, i) => {
    doc.text(String(v), tx2 + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
    tx2 += colWidths[i];
  });

  doc.end();

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ PDF report generated! Download here: http://localhost:5000/reports/${filename}`,
  });


          
} else if (lower.includes("campus")) {
  const [data] = await pool.query(`
    SELECT 
      campus,
      SUM(CASE WHEN group_type = 'PWD' THEN 1 ELSE 0 END) AS PWD,
      SUM(CASE WHEN group_type = 'IPS' THEN 1 ELSE 0 END) AS IPS,
      SUM(CASE WHEN group_type = 'SOLO_PARENT' THEN 1 ELSE 0 END) AS SOLO_PARENT
    FROM students
    GROUP BY campus
  `);

  // 🔑 ensure numbers (no strings)
  const rows = data.map(r => ({
    campus: r.campus,
    PWD: Number(r.PWD) || 0,
    IPS: Number(r.IPS) || 0,
    SOLO_PARENT: Number(r.SOLO_PARENT) || 0,
  }));

  const filePath = path.join(__dirname, "../reports/campuses-report.pdf");
  const title = "Campus Report (PWD, IPS, Solo Parent)";

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(filePath));

  // Title
  doc.fontSize(18).text(title, { align: "center" }).moveDown(2);

  // Table layout
  const startX = 50;
  let startY = 120;
  const colWidths = [230, 90, 90, 120];
  const rowHeight = 30;

  // Header
  doc.rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill("#5271FF");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(12);
  const headers = ["Campus", "PWD", "IPS", "Solo Parent"];
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
    x += colWidths[i];
  });

  // Rows
  startY += rowHeight;
  doc.font("Helvetica").fontSize(12);
  rows.forEach((r, idx) => {
    const rowBg = idx % 2 === 0 ? "#FFFFFF" : "#F9F9F9";
    doc.fillColor(rowBg).rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill();
    doc.fillColor("black");
    let borderX = startX;
    colWidths.forEach(w => { doc.rect(borderX, startY, w, rowHeight).stroke(); borderX += w; });

    const vals = [r.campus, r.PWD, r.IPS, r.SOLO_PARENT];
    let tx = startX;
    vals.forEach((v, i) => {
      doc.text(String(v), tx + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
      tx += colWidths[i];
    });

    startY += rowHeight;
  });

  // ✅ Totals (true numeric sum)
  const totalPWD  = rows.reduce((s, r) => s + r.PWD, 0);
  const totalIPS  = rows.reduce((s, r) => s + r.IPS, 0);
  const totalSolo = rows.reduce((s, r) => s + r.SOLO_PARENT, 0);

  doc.fillColor("#E6E6E6").rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill();
  doc.fillColor("black").font("Helvetica-Bold");
  let bx = startX;
  colWidths.forEach(w => { doc.rect(bx, startY, w, rowHeight).stroke(); bx += w; });

  const totals = ["TOTAL", totalPWD, totalIPS, totalSolo];
  let tx2 = startX;
  totals.forEach((v, i) => {
    doc.text(String(v), tx2 + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
    tx2 += colWidths[i];
  });

  doc.end();

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ PDF report generated! Download here: http://localhost:5000/reports/${filename}`,
  });




       } else if (lower.includes("event")) {
  const [data] = await pool.query(`
    SELECT e.title, c.name as campus, e.date, e.venue
    FROM events e
    LEFT JOIN campuses c ON e.campus_id = c.id
    ORDER BY e.date DESC
  `);

  // sanitize rows
  const rows = data.map(r => ({
    title: r.title,
    campus: r.campus || "N/A",
    date: r.date ? new Date(r.date).toLocaleDateString() : "N/A",
    venue: r.venue || "N/A",
  }));

  const filePath = path.join(__dirname, "../reports/events-report.pdf");
  const title = "Events Report";

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  doc.pipe(fs.createWriteStream(filePath));

  // Title
  doc.fontSize(18).text(title, { align: "center" }).moveDown(2);

  // Table layout
  const startX = 40;
  let startY = 120;
  const colWidths = [180, 120, 100, 120]; // Title | Campus | Date | Venue
  const rowHeight = 30;

  // Header row
  doc.rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill("#5271FF");
  doc.fillColor("white").font("Helvetica-Bold").fontSize(12);

  const headers = ["Title", "Campus", "Date", "Venue"];
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
    x += colWidths[i];
  });

  // Data rows
  startY += rowHeight;
  doc.font("Helvetica").fontSize(11);

  rows.forEach((r, idx) => {
    const bgColor = idx % 2 === 0 ? "#FFFFFF" : "#F9F9F9";
    doc.fillColor(bgColor).rect(startX, startY, colWidths.reduce((a,b)=>a+b,0), rowHeight).fill();
    doc.fillColor("black");

    // Borders
    let borderX = startX;
    colWidths.forEach(w => { 
      doc.rect(borderX, startY, w, rowHeight).stroke(); 
      borderX += w; 
    });

    // Values
    const vals = [r.title, r.campus, r.date, r.venue];
    let tx = startX;
    vals.forEach((v, i) => {
      doc.text(String(v), tx + 5, startY + 8, { width: colWidths[i] - 10, align: "center" });
      tx += colWidths[i];
    });

    startY += rowHeight;
  });

  doc.end();

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ PDF report generated! Download here: http://localhost:5000/reports/${filename}`,
  });
}
      }

      if (lower.includes("download") && lower.includes("excel")) {
        let rows, filePath, sheetName;

if (lower.includes("student")) {
  const [data] = await pool.query(`
    SELECT 
      campus,
      COUNT(*) AS total_students,
      SUM(CASE WHEN group_type = 'PWD' THEN 1 ELSE 0 END) AS PWD,
      SUM(CASE WHEN group_type = 'IPS' THEN 1 ELSE 0 END) AS IPS,
      SUM(CASE WHEN group_type = 'SOLO_PARENT' THEN 1 ELSE 0 END) AS SOLO_PARENT,
      SUM(CASE WHEN sex = 'FEMALE' THEN 1 ELSE 0 END) AS FEMALE,
      SUM(CASE WHEN sex = 'MALE' THEN 1 ELSE 0 END) AS MALE
    FROM students
    GROUP BY campus
  `);

  const rows = data.map(r => ({
    campus: r.campus,
    total_students: Number(r.total_students) || 0,
    PWD: Number(r.PWD) || 0,
    IPS: Number(r.IPS) || 0,
    SOLO_PARENT: Number(r.SOLO_PARENT) || 0,
    FEMALE: Number(r.FEMALE) || 0,
    MALE: Number(r.MALE) || 0,
  }));

  const filePath = path.join(__dirname, "../reports/students-report.xlsx");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Student Report");

  sheet.columns = [
    { header: "Campus", key: "campus", width: 20 },
    { header: "Total Students", key: "total_students", width: 15 },
    { header: "PWD", key: "PWD", width: 10 },
    { header: "IP's", key: "IPS", width: 10 },
    { header: "Solo Parent", key: "SOLO_PARENT", width: 15 },
    { header: "Female", key: "FEMALE", width: 10 },
    { header: "Male", key: "MALE", width: 10 },
  ];

  // Header style
  sheet.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5271FF" } };
    c.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
  });

  // Data rows
  rows.forEach(r => {
    const row = sheet.addRow(r);
    row.eachCell(c => {
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
    });
  });

  // Totals
  const totalRow = sheet.addRow({
    campus: "TOTAL",
    total_students: rows.reduce((s,r)=>s+r.total_students,0),
    PWD: rows.reduce((s,r)=>s+r.PWD,0),
    IPS: rows.reduce((s,r)=>s+r.IPS,0),
    SOLO_PARENT: rows.reduce((s,r)=>s+r.SOLO_PARENT,0),
    FEMALE: rows.reduce((s,r)=>s+r.FEMALE,0),
    MALE: rows.reduce((s,r)=>s+r.MALE,0),
  });

  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6E6" } };
    cell.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
  });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ Excel report generated! Download here: http://localhost:5000/reports/${filename}`,
  });



} else if (lower.includes("campus")) {
  const [data] = await pool.query(`
    SELECT 
      campus,
      SUM(CASE WHEN group_type = 'PWD' THEN 1 ELSE 0 END) AS PWD,
      SUM(CASE WHEN group_type = 'IPS' THEN 1 ELSE 0 END) AS IPS,
      SUM(CASE WHEN group_type = 'SOLO_PARENT' THEN 1 ELSE 0 END) AS SOLO_PARENT
    FROM students
    GROUP BY campus
  `);

  // 🔑 force numbers
  const rows = data.map(r => ({
    campus: r.campus,
    PWD: Number(r.PWD) || 0,
    IPS: Number(r.IPS) || 0,
    SOLO_PARENT: Number(r.SOLO_PARENT) || 0,
  }));

  const filePath = path.join(__dirname, "../reports/campuses-report.xlsx");
  const sheetName = "Campus Report";

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = [
    { header: "Campus", key: "campus", width: 25 },
    { header: "PWD", key: "PWD", width: 12 },
    { header: "IPS", key: "IPS", width: 12 },
    { header: "Solo Parent", key: "SOLO_PARENT", width: 16 },
  ];

  // Header style
  sheet.getRow(1).eachCell(c => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5271FF" } };
    c.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
  });

  // Data rows
  rows.forEach(r => {
    const row = sheet.addRow(r);
    row.eachCell(c => {
      c.alignment = { vertical: "middle", horizontal: "center" };
      c.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
    });
  });

  // ✅ Totals (true numeric sum)
  const totalPWD  = rows.reduce((s, r) => s + r.PWD, 0);
  const totalIPS  = rows.reduce((s, r) => s + r.IPS, 0);
  const totalSolo = rows.reduce((s, r) => s + r.SOLO_PARENT, 0);

  const totalRow = sheet.addRow({ campus: "TOTAL", PWD: totalPWD, IPS: totalIPS, SOLO_PARENT: totalSolo });
  totalRow.eachCell((cell, col) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6E6" } };
    cell.border = { top:{style:"thin"}, left:{style:"thin"}, bottom:{style:"thin"}, right:{style:"thin"} };
  });

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ Excel report generated! Download here: http://localhost:5000/reports/${filename}`,
  });


  

 } else if (lower.includes("event")) {
  const [data] = await pool.query(`
    SELECT e.title, c.name as campus, e.date, e.venue
    FROM events e
    LEFT JOIN campuses c ON e.campus_id = c.id
    ORDER BY e.date DESC
  `);

  // Clean rows
  const rows = data.map(r => ({
    title: r.title,
    campus: r.campus || "N/A",
    date: r.date ? new Date(r.date).toLocaleDateString() : "N/A",
    venue: r.venue || "N/A",
  }));

  const filePath = path.join(__dirname, "../reports/events-report.xlsx");
  const sheetName = "Events Report";

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  // 🧱 Define columns
  sheet.columns = [
    { header: "Title", key: "title", width: 30 },
    { header: "Campus", key: "campus", width: 20 },
    { header: "Date", key: "date", width: 15 },
    { header: "Venue", key: "venue", width: 25 },
  ];

  // 🧭 Header style
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5271FF" } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // 🧾 Add data rows
  rows.forEach((r) => {
    const row = sheet.addRow(r);
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // ➕ Add total row (count of events)
  const totalEvents = rows.length;
  const totalRow = sheet.addRow({
    title: "TOTAL EVENTS",
    campus: totalEvents,
    date: "",
    venue: "",
  });

  totalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true };
    cell.alignment = { vertical: "middle", horizontal: colNumber === 1 ? "left" : "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6E6E6" } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // 💾 Save
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);

  const filename = path.basename(filePath);
  return res.json({
    reply: `✅ Excel report generated! Download here: http://localhost:5000/reports/${filename}`,
  });
}
      }

      // 🏫 1. Gather DB snapshots
      const [[studentCount]] = await pool.query("SELECT COUNT(*) as total FROM students");
      const [campuses] = await pool.query("SELECT id, name FROM campuses");
      const [events] = await pool.query(
        "SELECT title, date, venue, campus_id FROM events ORDER BY date DESC LIMIT 5"
      );
      const [users] = await pool.query(
        "SELECT id, username, email, campus_id FROM campus_users LIMIT 5"
      );
      const [years] = await pool.query("SELECT id, name FROM year_sections");
      const [byCampus] = await pool.query(
        "SELECT campus, COUNT(*) as count FROM students GROUP BY campus"
      );
      const [byYear] = await pool.query(
        "SELECT yearSection, COUNT(*) as count FROM students GROUP BY yearSection"
      );

      // 🧠 2. Build context prompt
      const context = `
You are an AI Assistant connected to a school database.
Here are snapshots you can use to answer naturally:

📊 Students:
- Total: ${studentCount.total}
- By Campus: ${byCampus.map((r) => `${r.campus}: ${r.count}`).join(", ")}
- By Year/Section: ${byYear.map((r) => `${r.yearSection}: ${r.count}`).join(", ")}

🏫 Campuses: ${campuses.map((c) => c.name).join(", ")}
📅 Recent Events: ${events.map((e) => `${e.title} at ${e.venue} on ${e.date}`).join(" | ")}
👥 Sample Users: ${users.map((u) => `${u.username} (${u.email})`).join(", ")}
📚 Year Sections: ${years.map((y) => y.name).join(", ")}

User asked: "${message}"
Answer clearly and conversationally in Filipino-English mix.
If answer requires detail not in snapshot, explain that you need more data.
      `;

      // 🤖 3. Call Ollama
      const ollamaRes = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gemma3:1b",
          prompt: context,
          stream: false,
        }),
      });

      const data = await ollamaRes.json();
      const reply = data.response || "⚠️ Sorry, walang nahanap na sagot si AI.";

      res.json({ reply });
    } catch (err) {
      console.error("Chat AI error:", err);
      res.status(500).json({ error: "Failed to process AI request" });
    }
  });

  return router;
};
