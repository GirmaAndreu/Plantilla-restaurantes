# Plantilla · Web de restaurante con reservas propias

Web de restaurante con reservas sin comisiones: el cliente elige día, hora y personas, recibe un email de confirmación con un enlace para cancelar, y el restaurante gestiona todo desde un panel en el móvil.

**Sin dependencias.** Es HTML, CSS y JS normal, más 4 funciones de servidor en `/api`. No hay `npm install` ni compilación: se sube a GitHub, Vercel lo publica y listo.

| Pieza | Herramienta | Coste |
|---|---|---|
| Web y funciones | Vercel | Gratis (plan Hobby) |
| Base de datos | Supabase | Gratis |
| Emails | Resend | Gratis hasta 3.000/mes |

---

## 1. Qué hay dentro

```
index.html            Web: portada, la casa, carta, galería, reservas, horario
admin.html            Panel del restaurante (contraseña)
cancelar.html         Página a la que lleva el enlace del email
privacidad.html       Política de privacidad (PLANTILLA: rellenar datos)
aviso-legal.html      Aviso legal (PLANTILLA: rellenar datos)
site.config.js        ★ TODO lo del cliente: datos, turnos, aforo, carta, galería
css/tokens.css        ★ Colores, letras y espaciados de la marca
css/styles.css        Estilos de la web
js/booking-core.js    Lógica de disponibilidad (la usan web y servidor)
js/booking-widget.js  El widget de 3 pasos
js/api.js             Habla con /api, o con el modo demo si no hay base de datos
js/main.js            Pinta la carta, galería, horario y animaciones
js/admin.js           Lógica del panel
api/                  Funciones de servidor (Vercel): availability, reserve, cancel, admin
lib/server.js         Conexión con Supabase y Resend
supabase/schema.sql   Tablas y función anti-overbooking (pegar en Supabase)
scripts/dev-server.js Servidor local:  npm run dev
scripts/test.js       21 pruebas automáticas:  npm test
img/                  Fotos (ver img/LEEME-FOTOS.txt)
```

## 2. Modo demo (para enseñarla a restaurantes)

Si Vercel **no** tiene las variables de Supabase, la web funciona igual pero guarda las reservas solo en el navegador de quien la prueba. Viene con reservas de ejemplo para que el panel no salga vacío.

- Web: `tu-proyecto.vercel.app`
- Panel: `tu-proyecto.vercel.app/admin.html` → contraseña **demo**
- Aparece un aviso "Modo demo" junto al formulario.

Para la demo de ventas basta con subirla a Vercel tal cual. No hace falta configurar nada más.

## 3. Cómo funciona la disponibilidad

En `site.config.js → reservations.services` defines los turnos (comida, cena…):

- **days**: qué días abre ese turno (0 = domingo … 6 = sábado).
- **start / end**: primera y última hora de llegada.
- **intervalMinutes**: cada cuánto hay una franja (15 = 13:00, 13:15…).
- **capacityPerSlot**: máximo de personas que pueden llegar a la misma hora. Así la cocina no recibe a todo el mundo de golpe.
- **capacityPerService**: aforo total del turno.
- **minNoticeMinutes**: antelación mínima (por defecto, no se puede reservar con menos de 90 min).
- **maxParty**: grupos mayores ven el botón para llamar.
- **closedDates**: festivos y vacaciones fijos.

**Anti-overbooking:** la reserva se guarda con una función SQL que bloquea el turno mientras cuenta las plazas. Aunque dos personas reserven en el mismo segundo, nunca se pasa del aforo. Está probado en `npm test`.

## 4. Poner en marcha un cliente real (unos 30 min)

### 4.1 Supabase (base de datos)
1. supabase.com → New project. Región: **West EU (Ireland)** o **Central EU (Frankfurt)**.
2. **SQL Editor → New query** → pega todo `supabase/schema.sql` → **Run**.
3. **Project Settings → API**: copia la **Project URL** y la clave **service_role** (es secreta y solo va en Vercel).

> En el plan gratis, un proyecto que no recibe ninguna visita en una semana se pausa. Con una web en uso no pasa, pero conviene revisarlo en las demos.

### 4.2 Resend (emails)
1. resend.com → **Domains → Add domain** con el dominio del restaurante → añade los registros DNS que te da (DNS son las "indicaciones" del dominio, se pegan donde se compró el dominio).
2. **API Keys → Create**.
3. Sin dominio verificado, Resend solo deja enviarte emails a ti mismo. Sirve para probar, pero no para clientes reales.

### 4.3 Vercel
1. Sube la carpeta a un repo nuevo de GitHub (con GitHub Desktop o arrastrando en la web).
2. vercel.com → **Add New → Project** → importa el repo. Framework: **Other**. Sin comando de build.
3. **Settings → Environment Variables**: añade las de `.env.example`:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, `RESEND_FROM`, `NOTIFY_EMAIL`, `SITE_URL`.
4. **Deployments → Redeploy** para que las coja. El aviso "Modo demo" desaparece: ya es real.
5. Dominio propio: **Settings → Domains**.

### 4.4 Prueba final (5 min)
- Haz una reserva con tu email → te llega la confirmación → el restaurante recibe el aviso.
- Abre el enlace "Cancelar reserva" del email → cancela → en el panel aparece tachada.
- En el panel: añade una por teléfono, cierra un día y mira que la web lo muestra cerrado.

## 5. Checklist de cliente nuevo

- [ ] Duplicar el repo de la plantilla (en GitHub: **Use this template** si lo marcas como plantilla).
- [ ] `site.config.js`: nombre, teléfono, WhatsApp, email, dirección, Google Maps, Instagram, `siteUrl`.
- [ ] `site.config.js`: horario visible, turnos, aforos, festivos.
- [ ] `site.config.js`: carta completa y nota de alérgenos.
- [ ] Fotos en `img/` (ver `img/LEEME-FOTOS.txt`).
- [ ] `css/tokens.css`: colores y tipografías de su marca.
- [ ] Textos de `index.html`: titular, sección "La casa", títulos de sección, `<title>`, descripción y URLs de Open Graph.
- [ ] Favicon (el SVG en línea del `<head>`) con su logo.
- [ ] `privacidad.html` y `aviso-legal.html` con razón social, NIF y dirección.
- [ ] Supabase + Resend + variables en Vercel (sección 4).
- [ ] Prueba final (4.4) y enseñarle el panel al dueño en su móvil (añadir a pantalla de inicio).

**Consejo de diseño:** el motor (reservas, panel, emails) se reutiliza tal cual. La capa visual conviene rediseñarla por cliente desde su marca, como hace tu skill de diseño: cambiar solo colores hace que todas las webs parezcan iguales.

## 6. Probar en tu ordenador

Necesitas Node 18 o superior.

```bash
npm run dev     # http://localhost:3000  (modo demo, o real si creas un .env)
npm test        # 21 pruebas de la lógica y la API con una base de datos falsa
```

## 7. Dirección de arte de la demo (Fogó)

- **Concepto:** brasa. Fondo carbón, crema de mantel y un único acento color brasa.
- **Firma:** una línea de brasa se dibuja bajo el titular y, al terminar, el botón "Reservar mesa" se enciende. Al fondo, un resplandor que respira.
- **Reserva como comanda:** el widget es un ticket con perforación.
- **Letras:** Fraunces (titulares, con cursiva de acento) + Manrope (textos).
- **Movimiento:** nivel ligero, sin librerías. Con "reducir movimiento" o sin JavaScript se ve todo, quieto.
- **Contrastes AA:** crema/carbón 15,6:1 · carbón/brasa (botón) 4,9:1 · brasa-tinta/crema 6,2:1.

## 8. Por validar (decisiones que tomé yo)

- Email **obligatorio** al reservar online, para enviar la confirmación y el enlace de cancelación. Las reservas por teléfono no lo piden.
- Teléfono obligatorio y casilla de privacidad (RGPD) obligatoria.
- Antelación mínima de 90 min, máximo 60 días vista, grupos online de 1 a 8 personas.
- Las reservas online se confirman al momento, sin aprobación manual del restaurante.
- El panel usa una sola contraseña compartida (sin usuarios por empleado).
- Sin pago ni señal por adelantado (no-shows): se puede añadir con Stripe como mejora de pago.

## 9. Pendientes / mejoras posibles

- Recordatorio por email 24 h antes (con un Vercel Cron).
- Señal con tarjeta para grupos grandes (Stripe).
- Exportar reservas a CSV desde el panel.
- Varios idiomas (ES / CA / EN).
- Textos legales revisados por un profesional.
