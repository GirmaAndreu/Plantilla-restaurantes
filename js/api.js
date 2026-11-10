// =============================================================
//  api.js — cliente de reservas para el navegador.
//  Si el servidor tiene Supabase conectado, usa /api.
//  Si no (demo, vista local), guarda todo en este navegador
//  con la MISMA lógica, para poder enseñar la plantilla sin backend.
// =============================================================
import config from "../site.config.js";
import {
  computeAvailability, checkBookable, validateBooking, findService, addDays, nowInTz,
} from "./booking-core.js";

let mode = null; // "live" | "demo"
const DEMO_PASSWORD = "demo";

async function call(path, { method = "GET", body, token } = {}) {
  const r = await fetch(path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw Object.assign(new Error("no-api"), { noApi: true });
  const data = await r.json();
  if (data && data.demo) throw Object.assign(new Error("demo"), { noApi: true });
  if (!r.ok) throw Object.assign(new Error(data.error || "Error"), { status: r.status, data });
  return data;
}

async function withFallback(liveFn, demoFn) {
  if (mode === "demo") return demoFn();
  try {
    const out = await liveFn();
    mode = "live";
    return out;
  } catch (e) {
    if (e.noApi || e instanceof TypeError) {
      mode = "demo";
      document.documentElement.dataset.demo = "true";
      return demoFn();
    }
    throw e;
  }
}

export const isDemo = () => mode === "demo";

// ---------------- Almacén demo (localStorage) ----------------
const KEY = "plantilla-reservas-demo-v1";
const memory = { reservations: [], blocked: [], seeded: false };

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return memory.seeded ? memory : seed();
}
function save(s) {
  memory.reservations = s.reservations; memory.blocked = s.blocked; memory.seeded = true;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}
const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0; return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  }));

/** Reservas de ejemplo para que la demo y el panel no salgan vacíos. */
function seed() {
  const names = ["Marta P.", "Jordi C.", "Laia R.", "Pau M.", "Núria S.", "Albert G.", "Clara V.", "Oriol F."];
  const today = nowInTz(config.reservations.timezone).date;
  const reservations = [];
  let k = 0;
  for (let d = 0; d < 10; d++) {
    const date = addDays(today, d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    for (const s of config.reservations.services.filter((x) => x.days.includes(dow))) {
      const hot = [s.start, addMinutes(s.start, 30), addMinutes(s.start, 45)];
      for (const time of hot) {
        const party = 2 + ((k * 7) % 5);
        reservations.push({
          id: uuid(), cancel_token: uuid(), date, time, service: s.id, party,
          name: names[k % names.length], phone: "600 000 000", email: "demo@ejemplo.com",
          notes: k % 4 === 0 ? "Trona para bebé" : "", status: "confirmed",
          source: k % 3 === 0 ? "telefono" : "web", created_at: new Date().toISOString(),
        });
        k++;
      }
    }
  }
  const s = { reservations, blocked: [] };
  save(s);
  return s;
}
function addMinutes(t, m) {
  const [h, mm] = t.split(":").map(Number);
  const tot = h * 60 + mm + m;
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}
const confirmedOn = (s, date) => s.reservations.filter((r) => r.date === date && r.status === "confirmed");
const wait = (ms = 350) => new Promise((r) => setTimeout(r, ms));

// ---------------- API pública ----------------
export function getAvailability(date, party) {
  return withFallback(
    () => call(`/api/availability?date=${date}&party=${party}`),
    async () => {
      await wait(200);
      const s = load();
      return computeAvailability({
        config, date, party, reservations: confirmedOn(s, date), blocked: s.blocked.filter((b) => b.date === date),
      });
    }
  );
}

export function reserve(data) {
  return withFallback(
    () => call("/api/reserve", { method: "POST", body: data }),
    async () => {
      await wait();
      const v = validateBooking(config, data);
      if (!v.ok) throw Object.assign(new Error("Revisa los datos."), { data: { fields: v.errors } });
      const s = load();
      const b = v.value;
      const check = checkBookable({
        config, ...b, reservations: confirmedOn(s, b.date), blocked: s.blocked.filter((x) => x.date === b.date),
      });
      if (!check.ok) throw new Error(check.reason);
      const rec = {
        ...b, id: uuid(), cancel_token: uuid(), service: check.service.id, status: "confirmed",
        source: "web", created_at: new Date().toISOString(),
      };
      s.reservations.push(rec);
      save(s);
      return { ok: true, id: rec.id, date: b.date, time: b.time, party: b.party, demoCancelToken: rec.cancel_token };
    }
  );
}

export function getReservationByToken(token) {
  return withFallback(
    () => call(`/api/cancel?token=${encodeURIComponent(token)}`),
    async () => {
      const r = load().reservations.find((x) => x.cancel_token === token);
      if (!r) throw new Error("No encontramos esta reserva.");
      return r;
    }
  );
}

export function cancelByToken(token) {
  return withFallback(
    () => call("/api/cancel", { method: "POST", body: { token } }),
    async () => {
      await wait();
      const s = load();
      const r = s.reservations.find((x) => x.cancel_token === token);
      if (!r) throw new Error("No encontramos esta reserva.");
      r.status = "cancelled"; r.cancelled_at = new Date().toISOString();
      save(s);
      return { ok: true };
    }
  );
}

// ---------------- Panel admin ----------------
export const admin = {
  day(date, token) {
    return withFallback(
      () => call(`/api/admin?date=${date}`, { token }),
      async () => {
        if (token !== DEMO_PASSWORD) throw Object.assign(new Error("Contraseña incorrecta."), { status: 401 });
        const s = load();
        return {
          date,
          reservations: s.reservations.filter((r) => r.date === date).sort((a, b) => a.time.localeCompare(b.time)),
          blocked: s.blocked.filter((b) => b.date === date),
        };
      }
    );
  },

  action(body, token) {
    return withFallback(
      () => call("/api/admin", { method: "POST", body, token }),
      async () => {
        if (token !== DEMO_PASSWORD) throw Object.assign(new Error("Contraseña incorrecta."), { status: 401 });
        await wait(200);
        const s = load();
        if (body.action === "cancel" || body.action === "restore") {
          const r = s.reservations.find((x) => x.id === body.id);
          if (r) r.status = body.action === "cancel" ? "cancelled" : "confirmed";
        } else if (body.action === "block") {
          s.blocked = s.blocked.filter((b) => !(b.date === body.date && (b.service || null) === (body.service || null)));
          s.blocked.push({ date: body.date, service: body.service || null, reason: body.reason || "" });
        } else if (body.action === "unblock") {
          s.blocked = s.blocked.filter((b) => !(b.date === body.date && (b.service || null) === (body.service || null)));
        } else if (body.action === "create") {
          const v = validateBooking(config, { ...body, email: body.email || "sin-email@local.invalid" });
          const errs = { ...v.errors }; delete errs.party;
          if (Object.keys(errs).length) throw Object.assign(new Error("Revisa los datos."), { data: { fields: errs } });
          const b = { ...v.value, party: Math.max(1, Number.parseInt(body.party, 10) || 1) };
          const check = checkBookable({
            config, ...b, reservations: confirmedOn(s, b.date),
            blocked: s.blocked.filter((x) => x.date === b.date), force: Boolean(body.force),
          });
          if (!check.ok) throw Object.assign(new Error(check.reason), { data: { canForce: true } });
          s.reservations.push({
            ...b, email: body.email || "", id: uuid(), cancel_token: uuid(), service: check.service.id,
            status: "confirmed", source: "telefono", created_at: new Date().toISOString(),
          });
        }
        save(s);
        return { ok: true };
      }
    );
  },

  serviceFor: (date, time) => findService(config, date, time),
  resetDemo() { try { localStorage.removeItem(KEY); } catch {} memory.seeded = false; },
};
