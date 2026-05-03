const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");
const QRCode = require("qrcode");

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.VERCEL ? path.join("/tmp", "gradpic") : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const stamp = Date.now();
    const safeBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "photo";
    cb(null, `${stamp}-${safeBase}${path.extname(file.originalname).toLowerCase()}`);
  }
});

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 25 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/"));
  }
});

app.use(express.json());
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

function listPhotos() {
  return fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(uploadDir, entry.name);
      const stats = fs.statSync(fullPath);

      return {
        name: entry.name,
        url: `/uploads/${encodeURIComponent(entry.name)}`,
        addedAt: stats.birthtimeMs || stats.mtimeMs
      };
    })
    .sort((a, b) => a.addedAt - b.addedAt);
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)];
}

app.get("/api/photos", (_req, res) => {
  res.json({ photos: listPhotos() });
});

app.get("/api/upload-qr", async (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  const uploadUrl = `${origin}/`;

  try {
    const dataUrl = await QRCode.toDataURL(uploadUrl, {
      margin: 1,
      width: 320,
      color: {
        dark: "#1d1a17",
        light: "#0000"
      }
    });

    res.json({ uploadUrl, dataUrl });
  } catch (_error) {
    res.status(500).json({ error: "Could not generate QR code." });
  }
});

app.post("/api/photos", upload.array("photos", 10), (req, res) => {
  res.status(201).json({
    uploaded: (req.files || []).length,
    photos: listPhotos()
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  if (err) {
    return res.status(500).json({ error: "Upload failed." });
  }
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    const lanAddresses = getLanAddresses();

    console.log(`Party album running on http://localhost:${port}`);
    if (lanAddresses.length) {
      console.log("Open these from guest phones on the same Wi-Fi:");
      for (const address of lanAddresses) {
        console.log(`  http://${address}:${port}`);
      }
    }
    console.log(`TV slideshow: http://localhost:${port}/display.html`);
  });
}
