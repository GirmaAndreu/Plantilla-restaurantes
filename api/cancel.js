// GET  /api/cancel?token=...  → datos de la reserva
// POST /api/cancel { token }  → la cancela
import { send, query, readBody, isConfigured, db, emailRestaurant } from "../lib/server.js";

const TOKEN = /^[0-9a-f-]{36}$/i;

export default async function handler(req, res) {
  if (!isConfigured()) return send(res, 200, { demo: true });

  const token = req.method === "POST" ? (await readBody(req)).token : query(req).token;
  if (!TOKEN.test(String(token || ""))) return send(res, 400, { error: "Enlace no válido." });

  try {
    const rows = await db(
      `reservations?cancel_token=eq.${token}&select=id,date,time,party,name,phone,email,notes,status`
    );
    const r = rows[0];
    if (!r) return send(res, 404, { error: "No encontramos esta reserva." });

    if (req.method === "GET") {
      const { id, phone, email, ...publicData } = r;
      return send(res, 200, publicData);
    }
    if (req.method !== "POST") return send(res, 405, { error: "Método no permitido" });
    if (r.status === "cancelled") return send(res, 200, { ok: true, already: true });

    await db(`reservations?id=eq.${r.id}`, {
      method: "PATCH",
      body: { status: "cancelled", cancelled_at: new Date().toISOString() },
      prefer: "return=minimal",
    });
    await emailRestaurant(r, "cancelada");
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "No se pudo cancelar. Llámanos, por favor." });
  }
}
