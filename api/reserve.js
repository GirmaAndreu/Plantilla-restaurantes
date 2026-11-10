// POST /api/reserve  { date, time, party, name, phone, email, notes, website(trampa anti-bots) }
import { config, send, readBody, isConfigured, dayData, db, emailConfirmation, emailRestaurant } from "../lib/server.js";
import { validateBooking, checkBookable } from "../js/booking-core.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
  if (!isConfigured()) return send(res, 200, { demo: true });

  const body = await readBody(req);
  // Trampa anti-bots: campo oculto que una persona nunca rellena.
  if (body.website) return send(res, 200, { ok: true, id: "ok" });

  const v = validateBooking(config, body);
  if (!v.ok) return send(res, 400, { error: "Revisa los datos.", fields: v.errors });
  const b = v.value;

  try {
    const { reservations, blocked } = await dayData(b.date);
    const check = checkBookable({ config, ...b, reservations, blocked });
    if (!check.ok) return send(res, 409, { error: check.reason });
    const s = check.service;

    // La función SQL bloquea el turno y vuelve a contar plazas: imposible el overbooking
    // aunque dos personas reserven en el mismo segundo.
    const rows = await db("rpc/create_reservation", {
      method: "POST",
      body: {
        p_date: b.date, p_time: b.time, p_service: s.id, p_party: b.party,
        p_name: b.name, p_phone: b.phone, p_email: b.email, p_notes: b.notes,
        p_slot_cap: s.capacityPerSlot, p_service_cap: s.capacityPerService, p_source: "web",
      },
    });
    const saved = Array.isArray(rows) ? rows[0] : rows;
    const booking = { ...b, service: s.id, id: saved.id, cancel_token: saved.cancel_token };

    await Promise.all([emailConfirmation(booking), emailRestaurant(booking, "nueva")]);
    return send(res, 200, { ok: true, id: saved.id, date: b.date, time: b.time, party: b.party });
  } catch (e) {
    if (String(e.details?.message || e.message).includes("FULL"))
      return send(res, 409, { error: "Lo sentimos, esa hora acaba de completarse. Elige otra, por favor." });
    console.error(e);
    return send(res, 500, { error: "No se pudo guardar la reserva. Llámanos, por favor." });
  }
}
