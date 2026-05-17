const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");
const QRCode = require("qrcode");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = process.env.PORT || 3000;
const adminPassword = process.env.ADMIN_PASSWORD;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClientKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || "gradpic-media";
const useSupabaseStorage = Boolean(supabaseUrl && supabaseServiceRoleKey && supabaseClientKey);
const dataDir = process.env.VERCEL ? path.join("/tmp", "gradpic") : path.join(__dirname, "data");
const uploadDir = path.join(dataDir, "uploads");
const storagePrefix = "photos";
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".m4v", ".avi"]);
const ALLOWED_UPLOAD_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/avi",
  "video/msvideo",
  "video/x-msvideo"
];
const ADMIN_COOKIE = "gradpic_admin";
const supabase = useSupabaseStorage
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

if (!useSupabaseStorage) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = useSupabaseStorage
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadDir),
      filename: (_req, file, cb) => cb(null, buildPhotoName(file.originalname))
    });

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 150 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/"));
  }
});

app.use(express.json());
if (!useSupabaseStorage) {
  app.use("/uploads", express.static(uploadDir));
}

app.get("/manage.html", (req, res, next) => {
  if (!adminPassword || isAdminRequest(req)) {
    return next();
  }

  return res.redirect("/manage-login.html");
});

app.use(express.static(path.join(__dirname, "public")));

function buildPhotoName(originalName) {
  const stamp = Date.now();
  const nonce = Math.random().toString(36).slice(2, 8);
  const safeBase = path
    .basename(originalName, path.extname(originalName))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "photo";

  return `${stamp}-${nonce}-${safeBase}${path.extname(originalName).toLowerCase()}`;
}

function mediaTypeFor(name, mimeType) {
  if (typeof mimeType === "string") {
    if (mimeType.startsWith("image/")) {
      return "image";
    }

    if (mimeType.startsWith("video/")) {
      return "video";
    }
  }

  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }

  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }

  return "image";
}

function mapLocalPhoto(entry) {
  const fullPath = path.join(uploadDir, entry.name);
  const stats = fs.statSync(fullPath);

  return {
    id: entry.name,
    name: entry.name,
    url: `/uploads/${encodeURIComponent(entry.name)}`,
    addedAt: stats.birthtimeMs || stats.mtimeMs,
    mediaType: mediaTypeFor(entry.name)
  };
}

function mapBlobPhoto(blob) {
  const objectPath = `${storagePrefix}/${blob.name}`;
  const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(objectPath);

  return {
    id: objectPath,
    name: blob.name,
    url: data.publicUrl,
    addedAt: new Date(blob.created_at || blob.updated_at || Date.now()).getTime(),
    mediaType: mediaTypeFor(blob.name, blob.metadata?.mimetype)
  };
}

async function listPhotos() {
  if (useSupabaseStorage) {
    const { data, error } = await supabase.storage.from(supabaseBucket).list(storagePrefix, {
      limit: 1000,
      sortBy: {
        column: "name",
        order: "asc"
      }
    });

    if (error) {
      throw error;
    }

    return (data || [])
      .filter((entry) => entry.id && entry.name)
      .map(mapBlobPhoto)
      .sort((a, b) => a.addedAt - b.addedAt);
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

function errorMessage(error, fallback) {
  return error?.cause?.message || error?.message || fallback;
}

function createAdminToken() {
  return crypto.createHmac("sha256", adminPassword).update("gradpic-admin-session").digest("hex");
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  const entries = raw.split(";").map((part) => part.trim()).filter(Boolean);
  const cookies = {};

  for (const entry of entries) {
    const index = entry.indexOf("=");
    if (index === -1) {
      continue;
    }

    const key = entry.slice(0, index);
    const value = entry.slice(index + 1);
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function isAdminRequest(req) {
  if (!adminPassword) {
    return true;
  }

  const cookies = parseCookies(req);
  const expected = createAdminToken();
  return cookies[ADMIN_COOKIE] === expected;
}

function setAdminCookie(res) {
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(createAdminToken())}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=43200"
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminCookie(res) {
  const parts = [`${ADMIN_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  res.setHeader("Set-Cookie", parts.join("; "));
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
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "Could not load photos.") });
  }
});

app.get("/api/upload-config", (_req, res) => {
  res.json({
    useSupabaseStorage,
    supabaseUrl: useSupabaseStorage ? supabaseUrl : null,
    supabaseClientKey: useSupabaseStorage ? supabaseClientKey : null,
    supabaseBucket: useSupabaseStorage ? supabaseBucket : null
  });
});

app.get("/api/admin/session", (req, res) => {
  res.json({
    enabled: Boolean(adminPassword),
    authenticated: isAdminRequest(req)
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!adminPassword) {
    return res.status(400).json({ error: "Admin login is not configured." });
  }

  const password = String(req.body?.password || "");
  if (password !== adminPassword) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  setAdminCookie(res);
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  return res.json({ ok: true });
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

app.post("/api/supabase/upload-url", async (req, res) => {
  if (!useSupabaseStorage) {
    return res.status(400).json({ error: "Supabase uploads are not configured for this environment." });
  }

  try {
    const objectPath = String(req.body?.path || "");
    const contentType = String(req.body?.contentType || "");

    if (!objectPath.startsWith(`${storagePrefix}/`) || objectPath.includes("..")) {
      return res.status(400).json({ error: "Invalid upload path." });
    }

    if (!ALLOWED_UPLOAD_TYPES.includes(contentType)) {
      return res.status(400).json({ error: "Unsupported file type." });
    }

    const { data, error } = await supabase.storage.from(supabaseBucket).createSignedUploadUrl(
      objectPath,
      {
        upsert: false
      }
    );

    if (error) {
      throw error;
    }

    return res.status(200).json({
      path: objectPath,
      token: data.token
    });
  } catch (error) {
    return res.status(400).json({ error: errorMessage(error, "Could not prepare upload.") });
  }
});

app.post("/api/photos", upload.array("photos", 10), async (req, res) => {
  try {
    const files = req.files || [];

    if (useSupabaseStorage) {
      return res.status(400).json({ error: "Direct server uploads are disabled when Supabase is configured." });
    }

    res.status(201).json({
      uploaded: files.length,
      photos: await listPhotos()
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "Upload failed.") });
  }
});

app.delete("/api/photos", async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Admin login required." });
  }

  const ids = normalizePhotoIds(req.body?.ids || req.body?.names);
  const deleted = [];
  const missing = [];

  if (!ids.length) {
    return res.status(400).json({ error: "Choose at least one photo to delete." });
  }

  if (useSupabaseStorage) {
    try {
      const { error } = await supabase.storage.from(supabaseBucket).remove(ids);

      if (error) {
        throw error;
      }

      return res.json({
        deleted: ids,
        missing,
        photos: await listPhotos()
      });
    } catch (error) {
      return res.status(500).json({ error: errorMessage(error, "Delete failed.") });
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
