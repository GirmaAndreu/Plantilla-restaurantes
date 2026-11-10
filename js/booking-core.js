// =============================================================
//  booking-core.js — lógica pura de reservas (sin DOM ni red).
//  La usan el servidor (/api) y el navegador (modo demo), así
//  ambos calculan la disponibilidad exactamente igual.
// =============================================================

export const pad = (n) => String(n).padStart(2, "0");

export function timeToMin(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

export function minToTime(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

export function isValidDateStr(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTimeStr(s) {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function dayOfWeek(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** Fecha y minuto actuales en la zona horaria del restaurante. */
export function nowInTz(tz, now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export function serviceSlots(service) {
  const out = [];
  const start = timeToMin(service.start);
  const end = timeToMin(service.end);
  for (let m = start; m <= end; m += service.intervalMinutes) out.push(minToTime(m));
  return out;
}

/** Servicio al que pertenece una hora concreta en una fecha (o null). */
export function findService(config, date, time) {
  const dow = dayOfWeek(date);
  return (
    config.reservations.services.find(
      (s) => s.days.includes(dow) && serviceSlots(s).includes(time)
    ) || null
  );
}

/**
 * ¿Está abierto el día? blocked = [{ date, service|null, reason }]
 * Devuelve { open, reason }
 */
export function dayStatus(config, date, blocked = [], now = new Date()) {
  const r = config.reservations;
  if (!isValidDateStr(date)) return { open: false, reason: "Fecha no válida." };
  const today = nowInTz(r.timezone, now).date;
  if (date < today) return { open: false, reason: "Esa fecha ya ha pasado." };
  if (date > addDays(today, r.maxDaysAhead))
    return { open: false, reason: `Solo aceptamos reservas con ${r.maxDaysAhead} días de antelación como máximo.` };
  if ((r.closedDates || []).includes(date)) return { open: false, reason: "Ese día el restaurante está cerrado." };
  const fullBlock = blocked.find((b) => b.date === date && !b.service);
  if (fullBlock) return { open: false, reason: fullBlock.reason || "Ese día no hay reservas online." };
  const dow = dayOfWeek(date);
  if (!r.services.some((s) => s.days.includes(dow)))
    return { open: false, reason: "Ese día el restaurante está cerrado." };
  return { open: true, reason: "" };
}

function sumParty(list) {
  return list.reduce((acc, x) => acc + Number(x.party || 0), 0);
}

/**
 * Disponibilidad de un día para un grupo.
 * reservations = reservas CONFIRMADAS de ese día [{ time, service, party }]
 */
export function computeAvailability({ config, date, party, reservations = [], blocked = [], now = new Date() }) {
  const r = config.reservations;
  const status = dayStatus(config, date, blocked, now);
  if (!status.open) return { date, closed: status.reason, services: [] };

  const { date: today, minutes: nowMin } = nowInTz(r.timezone, now);
  const dow = dayOfWeek(date);

  const services = r.services
    .filter((s) => s.days.includes(dow))
    .filter((s) => !blocked.some((b) => b.date === date && b.service === s.id))
    .map((s) => {
      const inService = reservations.filter((x) => x.service === s.id);
      const serviceLeft = s.capacityPerService - sumParty(inService);
      const times = serviceSlots(s).map((time) => {
        const tooSoon = date === today && timeToMin(time) < nowMin + r.minNoticeMinutes;
        const slotLeft = s.capacityPerSlot - sumParty(inService.filter((x) => x.time === time));
        const available = !tooSoon && party <= slotLeft && party <= serviceLeft;
        return { time, available };
      });
      return { id: s.id, label: s.label, times };
    })
    .filter((s) => s.times.length > 0);

  if (!services.length) return { date, closed: "Ese día no hay turnos disponibles.", services: [] };
  return { date, closed: false, services };
}

/** Comprobación final antes de guardar una reserva. */
export function checkBookable({ config, date, time, party, reservations = [], blocked = [], now = new Date(), force = false }) {
  const service = isValidDateStr(date) && isValidTimeStr(time) ? findService(config, date, time) : null;
  if (!service) return { ok: false, reason: "Esa hora no está disponible." };
  if (force) return { ok: true, service };
  const av = computeAvailability({ config, date, party, reservations, blocked, now });
  if (av.closed) return { ok: false, reason: av.closed };
  const slot = av.services.find((s) => s.id === service.id)?.times.find((t) => t.time === time);
  if (!slot || !slot.available)
    return { ok: false, reason: "Lo sentimos, esa hora acaba de completarse. Elige otra, por favor." };
  return { ok: true, service };
}

/** Valida y limpia los datos del formulario. */
export function validateBooking(config, input = {}) {
  const r = config.reservations;
  const errors = {};
  const clean = (v, max) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

  const value = {
    date: clean(input.date, 10),
    time: clean(input.time, 5),
    party: Number.parseInt(input.party, 10),
    name: clean(input.name, 80),
    phone: clean(input.phone, 25),
    email: clean(input.email, 120).toLowerCase(),
    notes: String(input.notes ?? "").trim().slice(0, 500),
  };

  if (!isValidDateStr(value.date)) errors.date = "Elige una fecha.";
  if (!isValidTimeStr(value.time)) errors.time = "Elige una hora.";
  if (!Number.isInteger(value.party) || value.party < r.minParty || value.party > r.maxParty)
    errors.party = `Reservas online de ${r.minParty} a ${r.maxParty} personas.`;
  if (value.name.length < 2) errors.name = "Escribe tu nombre.";
  if (value.phone.replace(/[^\d]/g, "").length < 9) errors.phone = "Escribe un teléfono válido.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) errors.email = "Escribe un email válido.";

  return { ok: Object.keys(errors).length === 0, errors, value };
}

/** Texto legible: "sábado, 14 de noviembre" */
export function formatDateEs(dateStr, opts = {}) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...opts,
  }).format(new Date(`${dateStr}T00:00:00Z`));
}
