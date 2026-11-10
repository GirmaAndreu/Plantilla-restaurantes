// GET /api/availability?date=AAAA-MM-DD&party=N
import { config, send, query, isConfigured, dayData } from "../lib/server.js";
import { computeAvailability, isValidDateStr } from "../js/booking-core.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "Método no permitido" });
  if (!isConfigured()) return send(res, 200, { demo: true });

  const { date, party } = query(req);
  const n = Number.parseInt(party, 10) || 2;
  if (!isValidDateStr(date)) return send(res, 400, { error: "Fecha no válida" });

  try {
    const { reservations, blocked } = await dayData(date);
    return send(res, 200, computeAvailability({ config, date, party: n, reservations, blocked }));
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "No se pudo consultar la disponibilidad. Llámanos, por favor." });
  }
}
