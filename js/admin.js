// =============================================================
//  admin.js — panel del restaurante (móvil primero)
// =============================================================
import config from "../site.config.js";
import { admin, isDemo } from "./api.js";
import { addDays, nowInTz, dayOfWeek, serviceSlots, formatDateEs } from "./booking-core.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const KEY = "panel-reservas-token";
const RC = config.reservations;
const today = () => nowInTz(RC.timezone).date;

let token = "";
try { token = sessionStorage.getItem(KEY) || ""; } catch {}
const initialDate = new URLSearchParams(location.search).get("date");
let date = /^\d{4}-\d{2}-\d{2}$/.test(initialDate || "") ? initialDate : today();
let data = null;
let timer = null;

$("[data-name]").textContent = `${config.restaurant.name} · Reservas`;
document.title = `Panel · ${config.restaurant.name}`;

function toast(msg) {
  const t = $("[data-toast]");
  t.textContent = msg;
  t.classList.add("is-on");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("is-on"), 2200);
}

// ---------- Login ----------
async function tryLogin(pw, silent = false) {
  try {
    data = await admin.day(date, pw);
    token = pw;
    try { sessionStorage.setItem(KEY, pw); } catch {}
    $("[data-login]").classList.add("hidden");
    $("[data-app]").classList.remove("hidden");
    $("[data-demo]").classList.toggle("hidden", !isDemo());
    render();
    clearInterval(timer);
    timer = setInterval(refresh, 60_000);
    return true;
  } catch (e) {
    if (isDemo()) $("[data-login-sub]").innerHTML = "Modo demo: la contraseña es <strong>demo</strong>.";
    if (!silent) {
      const err = $("[data-login-err]");
      err.textContent = e.status === 401 ? "Contraseña incorrecta." : e.message;
      err.classList.remove("hidden");
    }
    return false;
  }
}

$("[data-login-form]").addEventListener("submit", (e) => {
  e.preventDefault();
  tryLogin($("#pw").value);
});
$("[data-logout]").addEventListener("click", () => {
  try { sessionStorage.removeItem(KEY); } catch {}
  location.reload();
});

// ---------- Datos ----------
async function refresh() {
  try {
    data = await admin.day(date, token);
    render();
  } catch (e) {
    if (e.status === 401) location.reload();
    else toast(e.message);
  }
}

function setDate(d) {
  date = d;
  history.replaceState(null, "", `?date=${d}`);
  refresh();
}

$("[data-prev]").addEventListener("click", () => setDate(addDays(date, -1)));
$("[data-next]").addEventListener("click", () => setDate(addDays(date, 1)));
$("[data-today]").addEventListener("click", () => setDate(today()));
$("[data-date]").addEventListener("change", (e) => e.target.value && setDate(e.target.value));
$("[data-reset]").addEventListener("click", () => { admin.resetDemo(); refresh(); toast("Demo reiniciada"); });

// ---------- Pintar ----------
function servicesOfDay() {
  return RC.services.filter((s) => s.days.includes(dayOfWeek(date)));
}

function render() {
  if (!data) return;
  $("[data-date]").value = date;
  const isToday = date === today();
  $("[data-daytitle]").textContent = `${isToday ? "Hoy · " : ""}${formatDateEs(date)}`;

  const services = servicesOfDay();
  const confirmed = data.reservations.filter((r) => r.status === "confirmed");
  const dayBlock = data.blocked.find((b) => !b.service);
  const fixedClosed = (RC.closedDates || []).includes(date);

  // Aviso de día cerrado
  $("[data-banner]").innerHTML = fixedClosed
    ? `<div class="banner">Día cerrado en la configuración (festivo/vacaciones).</div>`
    : dayBlock
      ? `<div class="banner">Reservas online cerradas este día${dayBlock.reason ? `: ${esc(dayBlock.reason)}` : ""}.</div>`
      : !services.length
        ? `<div class="banner">El restaurante no abre este día de la semana.</div>`
        : "";

  // Resumen por turno
  const totalCovers = confirmed.reduce((a, r) => a + r.party, 0);
  const stats = [`<div class="stat"><b>${totalCovers}</b><span>personas · ${confirmed.length} reservas</span></div>`];
  for (const s of services) {
    const covers = confirmed.filter((r) => r.service === s.id).reduce((a, r) => a + r.party, 0);
    const pct = Math.min(100, Math.round((covers / s.capacityPerService) * 100));
    const blocked = data.blocked.some((b) => b.service === s.id);
    stats.push(`<div class="stat ${blocked ? "is-blocked" : ""}"><b>${covers}/${s.capacityPerService}</b><span>${esc(s.label)}${blocked ? " · cerrado online" : ""}</span><div class="bar"><i style="width:${pct}%"></i></div></div>`);
  }
  $("[data-stats]").innerHTML = stats.join("");

  // Bloquear / desbloquear
  const tools = [];
  if (!fixedClosed && services.length) {
    tools.push(dayBlock
      ? `<button class="btn" data-unblock>Reabrir reservas del día</button>`
      : `<button class="btn btn--danger" data-block>Cerrar reservas del día</button>`);
    if (!dayBlock) for (const s of services) {
      const b = data.blocked.some((x) => x.service === s.id);
      tools.push(`<button class="btn ${b ? "" : "btn--danger"}" data-${b ? "unblock" : "block"}-service="${esc(s.id)}">${b ? "Reabrir" : "Cerrar"} ${esc(s.label.toLowerCase())}</button>`);
    }
  }
  tools.push(`<button class="btn" data-refresh>Actualizar</button>`);
  $("[data-tools]").innerHTML = tools.join("");

  // Lista por turno
  if (!data.reservations.length) {
    $("[data-list]").innerHTML = `<div class="empty">Sin reservas este día.</div>`;
    return;
  }
  const groups = services.map((s) => ({ label: s.label, items: data.reservations.filter((r) => r.service === s.id) }));
  const others = data.reservations.filter((r) => !services.some((s) => s.id === r.service));
  if (others.length) groups.push({ label: "Otras", items: others });

  $("[data-list]").innerHTML = groups.filter((g) => g.items.length).map((g) => `
    <section class="group">
      <h2>${esc(g.label)} · ${g.items.filter((r) => r.status === "confirmed").reduce((a, r) => a + r.party, 0)} pers.</h2>
      ${g.items.map(row).join("")}
    </section>`).join("");
}

function row(r) {
  const cancelled = r.status === "cancelled";
  const tel = String(r.phone || "").replace(/[^\d+]/g, "");
  return `<article class="res ${cancelled ? "is-cancelled" : ""}">
    <div><div class="res__time">${esc(r.time)}</div><span class="res__party">${esc(r.party)} p</span></div>
    <div>
      <div class="res__name">${esc(r.name)}<span class="tag">${r.source === "telefono" ? "tel" : "web"}</span>${cancelled ? '<span class="tag">cancelada</span>' : ""}</div>
      <div class="res__meta"><a href="tel:${esc(tel)}">${esc(r.phone)}</a>${r.email && !r.email.endsWith(".invalid") ? ` · ${esc(r.email)}` : ""}</div>
      ${r.notes ? `<div class="res__notes">${esc(r.notes)}</div>` : ""}
    </div>
    <div>${cancelled
      ? `<button class="btn" data-restore="${esc(r.id)}">Recuperar</button>`
      : `<button class="btn btn--danger" data-cancel="${esc(r.id)}">Cancelar</button>`}</div>
  </article>`;
}

// ---------- Acciones ----------
async function act(body, okMsg) {
  try {
    await admin.action(body, token);
    toast(okMsg);
    await refresh();
  } catch (e) {
    toast(e.message);
  }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !$("[data-app]").contains(b)) return;
  const d = b.dataset;
  if (d.cancel) { if (confirm("¿Cancelar esta reserva?")) act({ action: "cancel", id: d.cancel }, "Reserva cancelada"); }
  else if (d.restore) act({ action: "restore", id: d.restore }, "Reserva recuperada");
  else if ("block" in d) {
    const reason = prompt("Motivo (lo verán los clientes):", "Completo / evento privado");
    if (reason !== null) act({ action: "block", date, reason }, "Día cerrado para reservas online");
  }
  else if ("unblock" in d) act({ action: "unblock", date }, "Día reabierto");
  else if (d.blockService) act({ action: "block", date, service: d.blockService, reason: "" }, "Turno cerrado");
  else if (d.unblockService) act({ action: "unblock", date, service: d.unblockService }, "Turno reabierto");
  else if ("refresh" in d) refresh().then(() => toast("Actualizado"));
  else if ("add" in d) openAdd();
});

// ---------- Añadir reserva (teléfono) ----------
const dlg = $("[data-dialog]");
const form = $("[data-add-form]");

function openAdd() {
  const services = servicesOfDay();
  const sel = $("#a-time");
  sel.innerHTML = services.length
    ? services.map((s) => `<optgroup label="${esc(s.label)}">${serviceSlots(s).map((t) => `<option>${t}</option>`).join("")}</optgroup>`).join("")
    : `<option value="">Sin turnos este día</option>`;
  form.reset();
  $("[data-add-err]").classList.add("hidden");
  form.querySelector("h3").textContent = `Nueva reserva · ${formatDateEs(date, { weekday: "short" })}`;
  dlg.showModal();
}

form.addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "save") return; // "Cerrar"
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  const save = async (force) => {
    const btn = $("[data-save]");
    btn.disabled = true;
    try {
      await admin.action({ action: "create", date, ...fd, party: Number(fd.party), force }, token);
      dlg.close();
      toast("Reserva añadida");
      refresh();
    } catch (err) {
      if (err.data?.canForce && !force) {
        if (confirm(`${err.message}\n\n¿Añadirla igualmente (por encima del aforo)?`)) return save(true);
      }
      const el = $("[data-add-err]");
      const fields = err.data?.fields;
      el.textContent = fields ? Object.values(fields).join(" ") : err.message;
      el.classList.remove("hidden");
    } finally {
      btn.disabled = false;
    }
  };
  save(false);
});

// ---------- Arranque ----------
(async () => {
  const ok = token ? await tryLogin(token, true) : false;
  if (!ok) {
    // Sonda para saber si estamos en modo demo y mostrar la pista
    await tryLogin("", true);
    $("#pw").focus();
  }
})();
