// =============================================================
//  lib/server.js — utilidades del servidor (solo se ejecuta en Vercel).
//  Sin dependencias: habla con Supabase y Resend por HTTP (fetch).
// =============================================================
import { timingSafeEqual } from "node:crypto";
import config from "../site.config.js";
import { formatDateEs } from "../js/booking-core.js";

export { config };

const env = (k) => (process.env[k] || "").trim();

/** Sin Supabase configurado la API responde { demo: true } y la web usa el modo demo local. */
export function isConfigured() {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

// ---------- Respuestas ----------
export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export function query(req) {
  return Object.fromEntries(new URL(req.url, "http://x").searchParams);
}

// ---------- Supabase (REST) ----------
export async function db(path, { method = "GET", body, prefer } = {}) {
  const url = `${env("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const r = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (!r.ok) {
    const err = new Error(data?.message || `Supabase ${r.status}`);
    err.status = r.status;
    err.details = data;
    throw err;
  }
  return data;
}

export async function dayData(date) {
  const [reservations, blocked] = await Promise.all([
    db(`reservations?date=eq.${date}&status=eq.confirmed&select=time,service,party`),
    db(`blocked?date=eq.${date}&select=date,service,reason`),
  ]);
  return { reservations, blocked };
}

// ---------- Admin ----------
export function isAdmin(req) {
  const expected = env("ADMIN_PASSWORD");
  if (!expected) return false;
  const given = String(req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- Emails (Resend) ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function sendEmail({ to, subject, html, replyTo }) {
  const key = env("RESEND_API_KEY");
  const from = env("RESEND_FROM");
  if (!key || !from || !to) return { skipped: true };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!r.ok) console.error("Resend error", r.status, await r.text());
    return { ok: r.ok };
  } catch (e) {
    console.error("Resend error", e);
    return { ok: false };
  }
}

function siteUrl() {
  return (env("SITE_URL") || config.restaurant.siteUrl).replace(/\/$/, "");
}

function wrap(title, inner) {
  const R = config.restaurant;
  return `<!doctype html><html><body style="margin:0;background:#f3ede3;font-family:Georgia,serif;color:#1c1a17">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px">
    <p style="font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#a33a17;margin:0 0 8px">${esc(R.name)}</p>
    <h1 style="font-size:26px;font-weight:normal;margin:0 0 20px">${esc(title)}</h1>
    ${inner}
    <hr style="border:0;border-top:1px solid #d9cfbf;margin:28px 0 16px">
    <p style="font-size:13px;color:#5b544b;margin:0">${esc(R.name)} · ${esc(R.address)}<br>${esc(R.phone)}</p>
  </div></body></html>`;
}

function detailsTable(b) {
  const row = (k, v) =>
    `<tr><td style="padding:6px 16px 6px 0;color:#5b544b;font-size:14px">${k}</td><td style="padding:6px 0;font-size:16px">${v}</td></tr>`;
  return `<table style="border-collapse:collapse;margin:0 0 8px">
    ${row("Día", esc(formatDateEs(b.date)))}
    ${row("Hora", esc(b.time))}
    ${row("Personas", esc(b.party))}
    ${row("Nombre", esc(b.name))}
    ${b.notes ? row("Notas", esc(b.notes)) : ""}
  </table>`;
}

export async function emailConfirmation(b) {
  const link = `${siteUrl()}/cancelar.html?token=${encodeURIComponent(b.cancel_token)}`;
  const html = wrap(
    "Tu mesa está reservada",
    `<p style="font-size:16px;line-height:1.5">Hola ${esc(b.name)}, te esperamos:</p>
     ${detailsTable(b)}
     <p style="font-size:14px;line-height:1.5;color:#5b544b">Si no puedes venir, cancela aquí para liberar la mesa:</p>
     <p><a href="${link}" style="display:inline-block;background:#1c1a17;color:#f3ede3;padding:12px 20px;text-decoration:none;border-radius:999px;font-family:Arial,sans-serif;font-size:14px">Cancelar reserva</a></p>`
  );
  return sendEmail({
    to: b.email,
    subject: `Reserva confirmada · ${config.restaurant.name} · ${formatDateEs(b.date)} ${b.time}`,
    html,
    replyTo: config.restaurant.email,
  });
}

export async function emailRestaurant(b, kind = "nueva") {
  const to = env("NOTIFY_EMAIL");
  const title = kind === "cancelada" ? "Reserva cancelada" : "Nueva reserva";
  const html = wrap(
    title,
    `${detailsTable(b)}
     <p style="font-size:14px">Tel: ${esc(b.phone)} · Email: ${esc(b.email)}</p>
     <p><a href="${siteUrl()}/admin.html?date=${b.date}" style="color:#a33a17">Ver el día en el panel</a></p>`
  );
  return sendEmail({ to, subject: `${title}: ${b.party} pers. · ${formatDateEs(b.date)} ${b.time}`, html, replyTo: b.email });
}
