const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const PORT = Number(process.env.PORT || 5173);
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(PUBLIC_DIR, "data");
const UPLOAD_DIR = path.join(PUBLIC_DIR, "uploads", "cards");
const CARD_DB_PATH = path.join(DATA_DIR, "cards.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 25_000_000) {
        req.destroy();
        reject(new Error("送信データが大きすぎます"));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("JSONを読み込めませんでした"));
      }
    });
    req.on("error", reject);
  });
}

function imageDataUrlToBuffer(dataUrl) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/);
  if (!match) {
    throw new Error("画像ファイルを読み込めませんでした");
  }
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const extension =
    {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
    }[mime] || ".png";

  return {
    buffer: Buffer.from(match[2], "base64"),
    extension,
  };
}

function readCards() {
  try {
    return JSON.parse(fs.readFileSync(CARD_DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeCards(cards) {
  fs.writeFileSync(CARD_DB_PATH, JSON.stringify(cards, null, 2));
}

function listCards(req, res) {
  const cards = readCards().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  sendJson(res, 200, cards);
}

async function createCard(req, res) {
  try {
    const payload = await readJson(req);
    const title = String(payload.title || "レシピカード").trim().slice(0, 80);
    const { buffer, extension } = imageDataUrlToBuffer(payload.image || "");

    if (buffer.length > 20_000_000) {
      sendJson(res, 413, { error: "画像サイズが大きすぎます。20MB以下にしてください。" });
      return;
    }

    const id = randomUUID();
    const filename = `${id}${extension}`;
    const relativeUrl = `/uploads/cards/${filename}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);

    const card = {
      id,
      title,
      url: relativeUrl,
      filename,
      createdAt: new Date().toISOString(),
    };
    const cards = readCards();
    cards.push(card);
    writeCards(cards);
    sendJson(res, 201, card);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function deleteCard(req, res) {
  const match = req.url.match(/^\/api\/cards\/([^/?#]+)$/);
  const cardId = match ? decodeURIComponent(match[1]) : "";
  const cards = readCards();
  const card = cards.find((item) => item.id === cardId);

  if (!card) {
    sendJson(res, 404, { error: "カードが見つかりません" });
    return;
  }

  const nextCards = cards.filter((item) => item.id !== cardId);
  writeCards(nextCards);
  fs.rm(path.join(UPLOAD_DIR, card.filename), { force: true }, () => {});
  sendJson(res, 200, { ok: true });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/cards") {
    listCards(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/cards") {
    createCard(req, res);
    return;
  }
  if (req.method === "DELETE" && /^\/api\/cards\/[^/?#]+$/.test(req.url)) {
    deleteCard(req, res);
    return;
  }
  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Recipe card app running at http://localhost:${PORT}/`);
});
