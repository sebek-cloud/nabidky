/* =====================================================================
   Orphans – Vyúčtovací nabídky · malý server pro Railway
   Zero-dependency Node HTTP server:
   - schová celou appku za přihlášení (podepsaná HttpOnly cookie),
   - heslo NENÍ v kódu, čte se z proměnné prostředí APP_PASSWORD,
   - statické soubory se servírují až po ověření.
   ===================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.APP_PASSWORD || "peakyblinders";
const SECRET = process.env.APP_SECRET || crypto.createHash("sha256").update("orphans:" + PASSWORD).digest("hex");
const MAX_AGE = 7 * 24 * 60 * 60; // 7 dní
const COOKIE = "orphans_sid";

// Perzistentní úložiště nabídek. Na Railway namontuj Volume a nastav DATA_DIR
// (např. /data), jinak se data ztratí při redeployi.
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { console.error("DATA_DIR:", e.message); }

function safeId(id) { return /^[A-Za-z0-9_-]{1,64}$/.test(id); }
function offerPath(id) { return path.join(DATA_DIR, id + ".json"); }

function listOffers() {
  let files = [];
  try { files = fs.readdirSync(DATA_DIR).filter(function (f) { return f.endsWith(".json"); }); } catch (e) {}
  const out = [];
  files.forEach(function (f) {
    try {
      const o = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf8"));
      out.push({
        id: o.id,
        cislo: (o.meta && o.meta.cislo) || "",
        odberatel: (o.customer && o.customer.nazev) || "",
        predmet: (o.meta && o.meta.predmet) || "",
        total: typeof o.total === "number" ? o.total : null,
        mena: (o.meta && o.meta.mena) || "CZK",
        savedAt: o.savedAt || 0
      });
    } catch (e) {}
  });
  out.sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
  return out;
}

/* ---- logo pro přihlašovací stránku (vytáhneme data-URI z js/logo.js) ---- */
let LOGO_DATA_URI = "";
try {
  const raw = fs.readFileSync(path.join(ROOT, "js", "logo.js"), "utf8");
  const m = raw.match(/"(data:image\/[^"]+)"/);
  if (m) LOGO_DATA_URI = m[1];
} catch (e) { /* logo je nepovinné */ }

/* ------------------------------ podpis cookie ------------------------------ */
function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function sign(payloadStr) {
  const data = b64url(payloadStr);
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  return data + "." + sig;
}
function makeToken() {
  const payload = JSON.stringify({ exp: Math.floor(Date.now() / 1000) + MAX_AGE });
  return sign(payload);
}
function verifyToken(token) {
  if (!token || token.indexOf(".") < 0) return false;
  const [data, sig] = token.split(".");
  const expected = b64url(crypto.createHmac("sha256", SECRET).update(data).digest());
  const a = Buffer.from(sig || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    return payload.exp && payload.exp > Math.floor(Date.now() / 1000);
  } catch (e) { return false; }
}
function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  h.split(";").forEach(function (p) {
    const i = p.indexOf("=");
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function isAuthed(req) {
  return verifyToken(parseCookies(req)[COOKIE]);
}

/* ------------------------------ statické soubory ------------------------------ */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf"
};
function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split("?")[0]);
  if (rel === "/" || rel === "") rel = "/index.html";
  // zabránit path traversal
  const safe = path.normalize(path.join(ROOT, rel));
  if (!safe.startsWith(ROOT)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(safe, function (err, buf) {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(safe).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(buf);
  });
}

/* ------------------------------ přihlašovací stránka ------------------------------ */
function loginPage(errorMsg) {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Přihlášení · Orphans</title>
<style>
  *{box-sizing:border-box} html,body{margin:0;height:100%}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:#fff;color:#1c1e21;display:flex;align-items:center;justify-content:center}
  form{width:320px;max-width:90vw;text-align:center;display:flex;flex-direction:column;gap:12px}
  img{width:220px;max-width:70%;margin:0 auto 4px;display:block}
  h1{font-size:20px;margin:0;font-weight:600}
  p{margin:0;color:#6b7280}
  input{padding:12px 14px;border:1px solid #e3e6ea;border-radius:10px;font-size:16px;text-align:center}
  button{padding:12px;border:0;border-radius:10px;background:#111;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:hover{opacity:.9}
  .err{color:#c0392b;font-size:14px}
</style></head><body>
<form method="POST" action="/api/login" autocomplete="off">
  ${LOGO_DATA_URI ? `<img src="${LOGO_DATA_URI}" alt="ORPHANS">` : `<h1 style="letter-spacing:.35em">ORPHANS</h1>`}
  <h1>Vyúčtovací nabídky</h1>
  <p>Zadejte heslo pro vstup</p>
  <input type="password" name="password" placeholder="Heslo" autofocus>
  <button type="submit">Vstoupit</button>
  ${errorMsg ? `<div class="err">${errorMsg}</div>` : ""}
</form></body></html>`;
}

function readBody(req, cb) {
  let data = "";
  req.on("data", function (c) { data += c; if (data.length > 1e5) req.destroy(); });
  req.on("end", function () { cb(data); });
}

/* ------------------------------ server ------------------------------ */
const server = http.createServer(function (req, res) {
  const url = req.url || "/";
  const secureFlag = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";

  // Přihlášení
  if (req.method === "POST" && url === "/api/login") {
    return readBody(req, function (body) {
      const params = new URLSearchParams(body);
      const pw = params.get("password") || "";
      const ok = pw.length === PASSWORD.length &&
        crypto.timingSafeEqual(Buffer.from(pw), Buffer.from(PASSWORD));
      if (ok) {
        res.writeHead(302, {
          "Set-Cookie": `${COOKIE}=${makeToken()}; HttpOnly; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secureFlag}`,
          "Location": "/"
        });
        return res.end();
      }
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(loginPage("Nesprávné heslo."));
    });
  }

  // Odhlášení
  if (req.method === "POST" && url === "/api/logout") {
    res.writeHead(302, {
      "Set-Cookie": `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureFlag}`,
      "Location": "/"
    });
    return res.end();
  }

  // Zdravotní check (Railway)
  if (url === "/healthz") { res.writeHead(200); return res.end("ok"); }

  // Vše ostatní vyžaduje přihlášení
  if (!isAuthed(req)) {
    if (url.indexOf("/api/") === 0) { res.writeHead(401, { "Content-Type": "application/json" }); return res.end('{"error":"unauthorized"}'); }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(loginPage(""));
  }

  // ------------------------- API: uložené nabídky -------------------------
  const jsonHead = { "Content-Type": "application/json; charset=utf-8" };

  // seznam
  if (req.method === "GET" && url === "/api/offers") {
    res.writeHead(200, jsonHead);
    return res.end(JSON.stringify(listOffers()));
  }

  // vytvořit / uložit
  if (req.method === "POST" && url === "/api/offers") {
    return readBody(req, function (body) {
      let data;
      try { data = JSON.parse(body || "{}"); } catch (e) { res.writeHead(400, jsonHead); return res.end('{"error":"bad json"}'); }
      let id = data.id && safeId(String(data.id)) ? String(data.id) : crypto.randomUUID();
      const record = {
        id: id,
        savedAt: Date.now(),
        customer: data.customer || {},
        meta: data.meta || {},
        items: data.items || [],
        total: typeof data.total === "number" ? data.total : null
      };
      try {
        fs.writeFileSync(offerPath(id), JSON.stringify(record));
        res.writeHead(200, jsonHead);
        return res.end(JSON.stringify({ id: id, savedAt: record.savedAt }));
      } catch (e) {
        res.writeHead(500, jsonHead);
        return res.end('{"error":"save failed"}');
      }
    });
  }

  // detail / smazání konkrétní nabídky: /api/offers/<id>
  const mOffer = url.match(/^\/api\/offers\/([^/?]+)$/);
  if (mOffer) {
    const id = decodeURIComponent(mOffer[1]);
    if (!safeId(id)) { res.writeHead(400, jsonHead); return res.end('{"error":"bad id"}'); }
    if (req.method === "GET") {
      try {
        const raw = fs.readFileSync(offerPath(id), "utf8");
        res.writeHead(200, jsonHead);
        return res.end(raw);
      } catch (e) { res.writeHead(404, jsonHead); return res.end('{"error":"not found"}'); }
    }
    if (req.method === "DELETE") {
      try { fs.unlinkSync(offerPath(id)); } catch (e) {}
      res.writeHead(200, jsonHead);
      return res.end('{"ok":true}');
    }
  }

  serveStatic(req, res, url);
});

server.listen(PORT, "0.0.0.0", function () {
  console.log("Orphans nabídky běží na portu " + PORT);
});
