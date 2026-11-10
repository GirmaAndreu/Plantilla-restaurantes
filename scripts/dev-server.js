// =============================================================
//  Servidor local sin dependencias:  npm run dev  →  http://localhost:3000
//  Sirve la web y ejecuta las funciones de /api igual que Vercel.
//  Sin variables de Supabase, todo funciona en modo demo.
//  Para probar con la base de datos real, crea un archivo .env (ver .env.example).
// =============================================================
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.env.PORT) || 3000;

// Carga .env si existe (formato CLAVE=valor)
const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const file = join(ROOT, "api", `${name}.js`);
      if (!existsSync(file)) { res.statusCode = 404; return res.end("Not found"); }
      const mod = await import(`${pathToFileURL(file).href}?t=${Date.now()}`);
      return await mod.default(req, res);
    }
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || /[/\\](\.env|scripts|supabase|lib|api)([/\\]|$)/.test(file.slice(ROOT.length))) {
      res.statusCode = 404; return res.end("Not found");
    }
    const s = await stat(file).catch(() => null);
    if (!s || !s.isFile()) { res.statusCode = 404; res.setHeader("Content-Type", "text/plain"); return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(await readFile(file));
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end("Error");
  }
});

server.listen(PORT, () => {
  const live = process.env.SUPABASE_URL ? "con Supabase" : "en MODO DEMO (sin base de datos)";
  console.log(`\n  Web:   http://localhost:${PORT}\n  Panel: http://localhost:${PORT}/admin.html\n  Funcionando ${live}\n`);
});
