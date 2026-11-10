// Panel del restaurante. Cabecera: Authorization: Bearer <ADMIN_PASSWORD>
// GET  /api/admin?date=AAAA-MM-DD            → reservas y bloqueos del día
// POST /api/admin { action: "cancel",  id }
// POST /api/admin { action: "restore", id }
// POST /api/admin { action: "create",  date, time, party, name, phone, email?, notes?, force? }
// POST /api/admin { action: "block",   date, service?, reason? }
// POST /api/admin { action: "unblock", date, service? }
import { config, send, query, readBody, isConfigured, isAdmin, db, dayData } from "../lib/server.js";
import { isValidDateStr, checkBookable, validateBooking } from "../js/booking-core.js";

const UUID = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (!isConfigured()) return send(res, 200, { demo: true });
  if (!isAdmin(req)) return send(res, 401, { error: "Contraseña incorrecta." });

  try {
    if (req.method === "GET") {
      const { date } = query(req);
      if (!isValidDateStr(date)) return send(res, 400, { error: "Fecha no válida" });
      const [reservations, blocked] = await Promise.all([
        db(`reservations?date=eq.${date}&select=*&order=time.asc,created_at.asc`),
        db(`blocked?date=eq.${date}&select=*`),
      ]);
      return send(res, 200, { date, reservations, blocked });
    }

    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    const body = await readBody(req);

    switch (body.action) {
      case "cancel":
      case "restore": {
        if (!UUID.test(String(body.id))) return send(res, 400, { error: "ID no válido" });
        await db(`reservations?id=eq.${body.id}`, {
          method: "PATCH",
          body: body.action === "cancel"
            ? { status: "cancelled", cancelled_at: new Date().toISOString() }
            : { status: "confirmed", cancelled_at: null },
          prefer: "return=minimal",
        });
        return send(res, 200, { ok: true });
      }

      case "create": {
        // Reservas por teléfono: el email es opcional y "force" permite saltarse el aforo.
        const v = validateBooking(config, { ...body, email: body.email || "sin-email@local.invalid" });
        const errs = { ...v.errors };
        delete errs.party; // el restaurante puede apuntar grupos grandes
        if (Object.keys(errs).length) return send(res, 400, { error: "Revisa los datos.", fields: errs });
        const b = v.value;
        b.party = Math.max(1, Number.parseInt(body.party, 10) || 1);

        const { reservations, blocked } = await dayData(b.date);
        const check = checkBookable({ config, ...b, reservations, blocked, force: Boolean(body.force) });
        if (!check.ok) return send(res, 409, { error: check.reason, canForce: true });
        const s = check.service;

        const rows = await db("rpc/create_reservation", {
          method: "POST",
          body: {
            p_date: b.date, p_time: b.time, p_service: s.id, p_party: b.party,
            p_name: b.name, p_phone: b.phone, p_email: body.email ? b.email : null, p_notes: b.notes,
            p_slot_cap: body.force ? 100000 : s.capacityPerSlot,
            p_service_cap: body.force ? 100000 : s.capacityPerService,
            p_source: "telefono",
          },
        });
        return send(res, 200, { ok: true, id: (Array.isArray(rows) ? rows[0] : rows).id });
      }

      case "block": {
        if (!isValidDateStr(body.date)) return send(res, 400, { error: "Fecha no válida" });
        await db("blocked?on_conflict=date,service_key", {
          method: "POST",
          body: { date: body.date, service: body.service || null, reason: String(body.reason || "").slice(0, 200) },
          prefer: "resolution=merge-duplicates,return=minimal",
        });
        return send(res, 200, { ok: true });
      }

      case "unblock": {
        if (!isValidDateStr(body.date)) return send(res, 400, { error: "Fecha no válida" });
        const filter = body.service ? `service=eq.${encodeURIComponent(body.service)}` : "service=is.null";
        await db(`blocked?date=eq.${body.date}&${filter}`, { method: "DELETE", prefer: "return=minimal" });
        return send(res, 200, { ok: true });
      }

      default:
        return send(res, 400, { error: "Acción desconocida" });
    }
  } catch (e) {
    if (String(e.details?.message || e.message).includes("FULL"))
      return send(res, 409, { error: "Esa franja está completa.", canForce: true });
    console.error(e);
    return send(res, 500, { error: "Error del servidor." });
  }
}
