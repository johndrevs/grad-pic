const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");
const QRCode = require("qrcode");
const { del, list, put } = require("@vercel/blob");

const app = express();
const port = process.env.PORT || 3000;
const useBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const dataDir = process.env.VERCEL ? path.join("/tmp", "gradpic") : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const blobPrefix = "photos/";

if (!useBlobStorage) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = useBlobStorage
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => cb(null, buildPhotoName(file.originalname))
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
if (!useBlobStorage) {
  app.use("/uploads", express.static(uploadDir));
}
app.use(express.static(path.join(__dirname, "public")));

function buildPhotoName(originalName) {
  const stamp = Date.now();
  const safeBase = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";

  return `${stamp}-${safeBase}${path.extname(originalName).toLowerCase()}`;
}

function mapLocalPhoto(entry) {
  const fullPath = path.join(uploadDir, entry.name);
  const stats = fs.statSync(fullPath);

  return {
    id: entry.name,
    name: entry.name,
    url: `/uploads/${encodeURIComponent(entry.name)}`,
    addedAt: stats.birthtimeMs || stats.mtimeMs
  };
}

function mapBlobPhoto(blob) {
  return {
    id: blob.pathname,
    name: path.basename(blob.pathname),
    url: blob.url,
    addedAt: new Date(blob.uploadedAt).getTime()
  };
}

async function listPhotos() {
  if (useBlobStorage) {
    const response = await list({
      prefix: blobPrefix,
      limit: 1000
    });

    return response.blobs.map(mapBlobPhoto).sort((a, b) => a.addedAt - b.addedAt);
  }

  return fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map(mapLocalPhoto)
    .sort((a, b) => a.addedAt - b.addedAt);
}

function resolveUploadPath(name) {
  const safeName = path.basename(String(name || ""));
  if (!safeName || safeName !== name) {
    return null;
  }

  return path.join(uploadDir, safeName);
}

function normalizePhotoIds(input) {
  return Array.isArray(input) ? input.filter((value) => typeof value === "string" && value) : [];
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

app.get("/api/photos", async (_req, res) => {
  try {
    res.json({ photos: await listPhotos() });
  } catch (_error) {
    res.status(500).json({ error: "Could not load photos." });
  }
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

app.post("/api/photos", upload.array("photos", 10), async (req, res) => {
  try {
    const files = req.files || [];

    if (useBlobStorage) {
      await Promise.all(
        files.map((file) =>
          put(`${blobPrefix}${buildPhotoName(file.originalname)}`, file.buffer, {
            access: "public",
            contentType: file.mimetype
          })
        )
      );
    }

    res.status(201).json({
      uploaded: files.length,
      photos: await listPhotos()
    });
  } catch (_error) {
    res.status(500).json({ error: "Upload failed." });
  }
});

app.delete("/api/photos", async (req, res) => {
  const ids = normalizePhotoIds(req.body?.ids || req.body?.names);
  const deleted = [];
  const missing = [];

  if (!ids.length) {
    return res.status(400).json({ error: "Choose at least one photo to delete." });
  }

  if (useBlobStorage) {
    try {
      await del(ids);

      return res.json({
        deleted: ids,
        missing,
        photos: await listPhotos()
      });
    } catch (_error) {
      return res.status(500).json({ error: "Delete failed." });
    }
  }

  for (const id of ids) {
    const filePath = resolveUploadPath(id);

    if (!filePath || !fs.existsSync(filePath)) {
      missing.push(id);
      continue;
    }

    fs.unlinkSync(filePath);
    deleted.push(id);
  }

  return res.json({
    deleted,
    missing,
    photos: await listPhotos()
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
