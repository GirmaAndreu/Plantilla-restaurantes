// =============================================================
//  npm test — prueba la lógica y la API con una base de datos FALSA
//  en memoria (no toca Supabase ni envía emails de verdad).
// =============================================================
import assert from "node:assert/strict";
import config from "../site.config.js";
import * as core from "../js/booking-core.js";

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.stack}`); process.exitCode = 1; }
};

// ---------- Base de datos falsa (imita la API REST de Supabase) ----------
const DB = { reservations: [], blocked: [] };
const emails = [];
const uuid = () => crypto.randomUUID();

function filterRows(rows, params) {
  return rows.filter((r) => {
    for (const [k, v] of params) {
      if (["select", "order", "on_conflict"].includes(k)) continue;
      if (v === "is.null" && r[k] != null) return false;
      if (v.startsWith("eq.") && String(r[k]) !== decodeURIComponent(v.slice(3))) return false;
    }
    return true;
  });
}
function pick(rows, select) {
  if (!select || select === "*") return rows;
  const cols = select.split(",");
  return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
}
const json = (status, data) =>
  new Response(status === 204 || data === undefined ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  const method = opts.method || "GET";

  if (u.host === "api.resend.com") { emails.push(body); return json(200, { id: uuid() }); }

  const table = u.pathname.replace("/rest/v1/", "");
  const params = [...u.searchParams.entries()];

  if (table === "rpc/create_reservation") {
    const same = DB.reservations.filter((r) => r.date === body.p_date && r.service === body.p_service && r.status === "confirmed");
    const svc = same.reduce((a, r) => a + r.party, 0);
    const slot = same.filter((r) => r.time === body.p_time).reduce((a, r) => a + r.party, 0);
    if (slot + body.p_party > body.p_slot_cap || svc + body.p_party > body.p_service_cap) return json(400, { message: "FULL" });
    const row = {
      id: uuid(), cancel_token: uuid(), date: body.p_date, time: body.p_time, service: body.p_service, party: body.p_party,
      name: body.p_name, phone: body.p_phone, email: body.p_email, notes: body.p_notes, status: "confirmed",
      source: body.p_source, created_at: new Date().toISOString(),
    };
    DB.reservations.push(row);
    return json(200, [{ id: row.id, cancel_token: row.cancel_token }]);
  }

  const rows = DB[table];
  if (!rows) return json(404, { message: "no table" });
  if (method === "GET") return json(200, pick(filterRows(rows, params), u.searchParams.get("select")));
  if (method === "PATCH") { filterRows(rows, params).forEach((r) => Object.assign(r, body)); return json(204); }
  if (method === "DELETE") { const del = new Set(filterRows(rows, params)); DB[table] = rows.filter((r) => !del.has(r)); return json(204); }
  if (method === "POST") {
    const i = rows.findIndex((r) => r.date === body.date && (r.service || null) === (body.service || null));
    if (i >= 0) rows[i] = { ...rows[i], ...body }; else rows.push({ id: uuid(), ...body });
    return json(201);
  }
};

// ---------- Simulador de req/res de Vercel ----------
async function call(handlerPath, { method = "GET", query = {}, body, auth } = {}) {
  const { default: handler } = await import(handlerPath);
  const qs = new URLSearchParams(query).toString();
  const req = { method, url: `/api/x${qs ? `?${qs}` : ""}`, headers: auth ? { authorization: `Bearer ${auth}` } : {}, body };
  const res = {
    statusCode: 200, headers: {}, out: "",
    setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.out = s || ""; },
  };
  await handler(req, res);
  return { status: res.statusCode, data: res.out ? JSON.parse(res.out) : null };
}
const AV = "../api/availability.js", RES = "../api/reserve.js", CAN = "../api/cancel.js", ADM = "../api/admin.js";

// Próximo sábado con al menos 2 días de margen (abren comida y cena)
const today = core.nowInTz(config.reservations.timezone).date;
let SAT = core.addDays(today, 2);
while (core.dayOfWeek(SAT) !== 6) SAT = core.addDays(SAT, 1);
let MON = core.addDays(today, 2);
while (core.dayOfWeek(MON) !== 1) MON = core.addDays(MON, 1);

const guest = (o = {}) => ({ date: SAT, time: "13:00", party: 2, name: "Ana Test", phone: "600 111 222", email: "ana@test.com", notes: "", ...o });

console.log("\nLógica");
await test("franjas de un turno", () => {
  assert.deepEqual(core.serviceSlots({ start: "13:00", end: "14:00", intervalMinutes: 30 }), ["13:00", "13:30", "14:00"]);
});
await test("fechas y validaciones", () => {
  assert.equal(core.isValidDateStr("2026-02-30"), false);
  assert.equal(core.isValidDateStr("2026-02-28"), true);
  assert.equal(core.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(core.dayStatus(config, core.addDays(today, -1)).open, false);
  assert.equal(core.dayStatus(config, core.addDays(today, config.reservations.maxDaysAhead + 1)).open, false);
  assert.equal(core.dayStatus(config, MON).open, false);
});
await test("antelación mínima: hoy no se ofrecen horas ya pasadas", () => {
  const tz = config.reservations.timezone;
  // Simula un sábado a las 14:00 hora local
  const fakeNow = new Date(`${SAT}T14:00:00${offsetOf(tz, SAT)}`);
  const av = core.computeAvailability({ config, date: SAT, party: 2, now: fakeNow });
  const comida = av.services.find((s) => s.id === "comida");
  assert.ok(comida.times.every((t) => !t.available), "comida debería estar toda cerrada");
  const cena = av.services.find((s) => s.id === "cena");
  assert.ok(cena.times.every((t) => t.available), "cena debería estar abierta");
});
await test("validación de formulario", () => {
  const v = core.validateBooking(config, { ...guest(), email: "mal", phone: "12", party: 99 });
  assert.equal(v.ok, false);
  assert.ok(v.errors.email && v.errors.phone && v.errors.party);
});

console.log("\nAPI sin Supabase (modo demo)");
await test("responde demo:true", async () => {
  const r = await call(AV, { query: { date: SAT, party: 2 } });
  assert.equal(r.data.demo, true);
});

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake";
process.env.RESEND_API_KEY = "re_fake";
process.env.RESEND_FROM = "Reservas <reservas@ejemplo.com>";
process.env.NOTIFY_EMAIL = "dueno@ejemplo.com";
process.env.ADMIN_PASSWORD = "secreta-123";

console.log("\nAPI con base de datos");
await test("disponibilidad de un sábado: comida y cena libres", async () => {
  const r = await call(AV, { query: { date: SAT, party: 2 } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.services.map((s) => s.id), ["comida", "cena"]);
  assert.ok(r.data.services.every((s) => s.times.every((t) => t.available)));
});
let first;
await test("reserva correcta + 2 emails (cliente y restaurante)", async () => {
  const r = await call(RES, { method: "POST", body: guest({ party: 8 }) });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(DB.reservations.length, 1);
  assert.equal(emails.length, 2);
  assert.ok(emails[0].html.includes("cancelar.html?token="));
  first = DB.reservations[0];
});
await test("no deja pasar del aforo por franja (8 + 5 > 12)", async () => {
  const r = await call(RES, { method: "POST", body: guest({ party: 5 }) });
  assert.equal(r.status, 409);
  const ok = await call(RES, { method: "POST", body: guest({ party: 4 }) });
  assert.equal(ok.status, 200);
});
await test("la disponibilidad refleja la franja llena", async () => {
  const r = await call(AV, { query: { date: SAT, party: 1 } });
  const t = r.data.services[0].times.find((x) => x.time === "13:00");
  assert.equal(t.available, false);
});
await test("aforo total del turno (48)", async () => {
  for (const time of ["13:15", "13:30", "13:45"]) {
    const r = await call(RES, { method: "POST", body: guest({ time, party: 8 }) });
    assert.equal(r.status, 200);
  }
  // 12 + 24 = 36 → caben 12 más
  const ok = await call(RES, { method: "POST", body: guest({ time: "14:00", party: 8 }) });
  assert.equal(ok.status, 200);
  const ko = await call(RES, { method: "POST", body: guest({ time: "14:15", party: 5 }) });
  assert.equal(ko.status, 409, "48 de aforo: 44 + 5 no cabe");
});
await test("reservas simultáneas no provocan overbooking", async () => {
  const rs = await Promise.all([1, 2, 3].map(() => call(RES, { method: "POST", body: guest({ time: "20:00", party: 6 }) })));
  assert.equal(rs.filter((r) => r.status === 200).length, 2);
});
await test("rechaza datos inválidos y día cerrado", async () => {
  const bad = await call(RES, { method: "POST", body: guest({ email: "nope" }) });
  assert.equal(bad.status, 400);
  assert.ok(bad.data.fields.email);
  const closed = await call(RES, { method: "POST", body: guest({ date: MON }) });
  assert.equal(closed.status, 409);
  const wrongTime = await call(RES, { method: "POST", body: guest({ time: "17:00" }) });
  assert.equal(wrongTime.status, 409);
});
await test("trampa anti-bots no guarda nada", async () => {
  const n = DB.reservations.length;
  const r = await call(RES, { method: "POST", body: guest({ website: "http://spam" }) });
  assert.equal(r.status, 200);
  assert.equal(DB.reservations.length, n);
});
await test("cancelar con el enlace del email libera la plaza", async () => {
  const g = await call(CAN, { query: { token: first.cancel_token } });
  assert.equal(g.status, 200);
  assert.equal(g.data.phone, undefined, "no expone el teléfono");
  const p = await call(CAN, { method: "POST", body: { token: first.cancel_token } });
  assert.equal(p.status, 200);
  assert.equal(first.status, "cancelled");
  const av = await call(AV, { query: { date: SAT, party: 8 } });
  assert.equal(av.data.services[0].times.find((x) => x.time === "13:00").available, true);
  const bad = await call(CAN, { query: { token: "x" } });
  assert.equal(bad.status, 400);
});

console.log("\nPanel admin");
await test("sin contraseña → 401", async () => {
  const r = await call(ADM, { query: { date: SAT }, auth: "otra" });
  assert.equal(r.status, 401);
});
await test("lista del día", async () => {
  const r = await call(ADM, { query: { date: SAT }, auth: "secreta-123" });
  assert.equal(r.status, 200);
  assert.ok(r.data.reservations.length >= 6);
});
await test("cerrar el día y reabrirlo", async () => {
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "block", date: SAT, reason: "Evento privado" } });
  let av = await call(AV, { query: { date: SAT, party: 2 } });
  assert.equal(av.data.closed, "Evento privado");
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "unblock", date: SAT } });
  av = await call(AV, { query: { date: SAT, party: 2 } });
  assert.equal(av.data.closed, false);
});
await test("cerrar solo un turno", async () => {
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "block", date: SAT, service: "cena" } });
  const av = await call(AV, { query: { date: SAT, party: 2 } });
  assert.deepEqual(av.data.services.map((s) => s.id), ["comida"]);
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "unblock", date: SAT, service: "cena" } });
});
await test("reserva por teléfono: pide forzar si está lleno, y fuerza", async () => {
  const body = { action: "create", date: SAT, time: "13:45", party: 6, name: "Llamada", phone: "611 222 333" };
  const r1 = await call(ADM, { method: "POST", auth: "secreta-123", body });
  assert.equal(r1.status, 409);
  assert.equal(r1.data.canForce, true);
  const r2 = await call(ADM, { method: "POST", auth: "secreta-123", body: { ...body, force: true } });
  assert.equal(r2.status, 200, JSON.stringify(r2.data));
  const saved = DB.reservations.find((x) => x.name === "Llamada");
  assert.equal(saved.source, "telefono");
  assert.equal(saved.email, null);
});
await test("grupo grande por teléfono (más del máximo online)", async () => {
  const r = await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "create", date: SAT, time: "20:30", party: 12, name: "Cumple", phone: "611 222 333" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});
await test("cancelar y recuperar desde el panel", async () => {
  const id = DB.reservations.find((x) => x.name === "Cumple").id;
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "cancel", id } });
  assert.equal(DB.reservations.find((x) => x.id === id).status, "cancelled");
  await call(ADM, { method: "POST", auth: "secreta-123", body: { action: "restore", id } });
  assert.equal(DB.reservations.find((x) => x.id === id).status, "confirmed");
});

console.log(`\n${passed} pruebas OK${process.exitCode ? " · HAY FALLOS" : ""}\n`);

// Desfase horario (+01:00/+02:00) de una zona en una fecha
function offsetOf(tz, date) {
  const d = new Date(`${date}T12:00:00Z`);
  const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  const min = (local - utc) / 60000;
  const s = min >= 0 ? "+" : "-";
  const a = Math.abs(min);
  return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
