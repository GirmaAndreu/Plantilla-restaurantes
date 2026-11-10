// =============================================================
//  booking-widget.js — el widget de reserva en 3 pasos:
//  1) personas, día y hora · 2) datos · 3) confirmación
// =============================================================
import config from "../site.config.js";
import { getAvailability, reserve, isDemo } from "./api.js";
import { addDays, nowInTz, dayStatus, formatDateEs } from "./booking-core.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DAYS_VISIBLE = 14;

export function mountBooking(root, { badge } = {}) {
  const RC = config.reservations;
  const today = nowInTz(RC.timezone).date;
  const firstOpen = (() => {
    for (let i = 0; i <= RC.maxDaysAhead; i++) {
      const d = addDays(today, i);
      if (dayStatus(config, d).open) return d;
    }
    return today;
  })();

  const state = {
    step: 1,
    party: Math.min(2, RC.maxParty),
    date: firstOpen,
    time: null,
    serviceLabel: "",
    avail: null,
    loading: false,
    error: "",
    form: { name: "", phone: "", email: "", notes: "" },
    fieldErrors: {},
    submitting: false,
    result: null,
    customDate: false,
  };
  let reqId = 0;

  const tel = `tel:${config.restaurant.phone.replace(/[^\d+]/g, "")}`;

  // ---------- Carga de disponibilidad ----------
  async function load() {
    const id = ++reqId;
    state.loading = true; state.error = ""; state.time = null;
    render();
    try {
      const av = await getAvailability(state.date, state.party);
      if (id !== reqId) return;
      state.avail = av;
    } catch (e) {
      if (id !== reqId) return;
      state.avail = null;
      state.error = e.message || "No se pudo cargar la disponibilidad.";
    }
    state.loading = false;
    if (badge) badge.hidden = !isDemo();
    render();
  }

  // ---------- Vistas ----------
  function header(title, step) {
    return `<div class="ticket__head"><h3 class="ticket__title">${title}</h3><span class="ticket__step">Paso ${step} de 3</span></div><div class="ticket__perf" aria-hidden="true"></div>`;
  }

  function viewStep1() {
    const partyChips = [];
    for (let n = RC.minParty; n <= RC.maxParty; n++) {
      partyChips.push(`<button type="button" class="chip" data-party="${n}" aria-pressed="${n === state.party}" aria-label="${n} ${n === 1 ? "persona" : "personas"}">${n}</button>`);
    }
    partyChips.push(`<a class="chip chip--other" href="${tel}" aria-label="Más de ${RC.maxParty} personas: llamar">+${RC.maxParty}</a>`);

    const dayChips = [];
    for (let i = 0; i < DAYS_VISIBLE; i++) {
      const d = addDays(today, i);
      const st = dayStatus(config, d);
      const wd = i === 0 ? "Hoy" : i === 1 ? "Mañ." : formatDateEs(d, { weekday: "short", day: undefined, month: undefined }).replace(".", "");
      const num = Number(d.slice(8, 10));
      const mon = formatDateEs(d, { weekday: undefined, day: undefined, month: "short" }).replace(".", "");
      dayChips.push(
        `<button type="button" class="chip chip--day" data-date="${d}" aria-pressed="${d === state.date}" ${st.open ? "" : "data-closed disabled"} aria-label="${esc(formatDateEs(d))}${st.open ? "" : ", cerrado"}"><small>${esc(wd)}</small><span>${num}</span><small>${esc(mon)}</small></button>`
      );
    }
    const inList = Number(new Date(`${state.date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 864e5 < DAYS_VISIBLE;
    dayChips.push(`<button type="button" class="chip chip--other" data-other-date aria-expanded="${state.customDate || !inList}">Otra fecha</button>`);

    return `
      ${header("Reserva tu mesa", 1)}
      <fieldset class="field">
        <legend>¿Cuántos sois?</legend>
        <div class="chips">${partyChips.join("")}</div>
      </fieldset>
      <fieldset class="field">
        <legend>¿Qué día? <span class="field__hint">· ${esc(formatDateEs(state.date))}</span></legend>
        <div class="chips chips--scroll">${dayChips.join("")}</div>
        <div class="date-other ${state.customDate || !inList ? "is-open" : ""}">
          <label class="field__label" for="bk-date">Elige fecha</label>
          <input class="input" type="date" id="bk-date" value="${state.date}" min="${today}" max="${addDays(today, RC.maxDaysAhead)}">
        </div>
      </fieldset>
      <fieldset class="field" aria-live="polite">
        <legend>¿A qué hora?</legend>
        ${viewTimes()}
      </fieldset>
      <button type="button" class="btn btn--dark btn--block btn--lg" data-next ${state.time ? "" : "disabled"}>
        ${state.time ? `Continuar · ${esc(state.time)}` : "Elige una hora"}
      </button>`;
  }

  function viewTimes() {
    if (state.loading) return `<div class="skeleton" aria-label="Cargando horas"><i></i><i></i><i></i><i></i><i></i></div>`;
    if (state.error) return `<p class="msg msg--error">${esc(state.error)} <a href="${tel}">Llámanos</a>.</p>`;
    const av = state.avail;
    if (!av) return "";
    if (av.closed) return `<p class="msg">${esc(av.closed)} Prueba otro día.</p>`;
    const anyFree = av.services.some((s) => s.times.some((t) => t.available));
    const blocks = av.services.map((s) => `
      <div class="service">
        <p class="service__label">${esc(s.label)}</p>
        <div class="chips">
          ${s.times.map((t) => `<button type="button" class="chip chip--time" data-time="${t.time}" data-service-label="${esc(s.label)}" aria-pressed="${t.time === state.time}" ${t.available ? "" : "disabled"} aria-label="${t.time}${t.available ? "" : ", completo"}">${t.time}</button>`).join("")}
        </div>
      </div>`).join("");
    const full = anyFree ? "" : `<p class="msg" style="margin-top:12px">No quedan mesas para ${state.party} ese día. Prueba otro día o <a href="${tel}">llámanos</a>.</p>`;
    return blocks + full;
  }

  function fieldHtml(name, label, type, auto, extra = "") {
    const err = state.fieldErrors[name];
    return `<div class="field">
      <label class="field__label" for="bk-${name}">${label}</label>
      <input class="input" id="bk-${name}" name="${name}" type="${type}" autocomplete="${auto}" value="${esc(state.form[name])}" ${err ? `aria-invalid="true" aria-describedby="bk-${name}-err"` : ""} ${extra}>
      ${err ? `<p class="field__error" id="bk-${name}-err">${esc(err)}</p>` : ""}
    </div>`;
  }

  function viewStep2() {
    return `
      ${header("Tus datos", 2)}
      <div class="summary">
        <span><strong>${state.party}</strong> ${state.party === 1 ? "persona" : "personas"}</span>
        <span>${esc(formatDateEs(state.date))}</span>
        <span><strong>${esc(state.time)}</strong></span>
        <button type="button" data-back>Cambiar</button>
      </div>
      ${state.error ? `<p class="msg msg--error" role="alert" style="margin-bottom:20px">${esc(state.error)}</p>` : ""}
      <form data-form novalidate>
        ${fieldHtml("name", "Nombre", "text", "name", 'required maxlength="80"')}
        <div class="form-row">
          ${fieldHtml("phone", "Teléfono", "tel", "tel", 'required inputmode="tel" maxlength="25"')}
          ${fieldHtml("email", "Email <span class=\"field__hint\">· te enviamos la confirmación</span>", "email", "email", 'required maxlength="120"')}
        </div>
        <div class="field">
          <label class="field__label" for="bk-notes">Algo que debamos saber <span class="field__hint">· opcional</span></label>
          <textarea class="input" id="bk-notes" name="notes" maxlength="500" placeholder="Alergias, trona, celebración…">${esc(state.form.notes)}</textarea>
        </div>
        <div class="hp" aria-hidden="true"><label>No rellenar <input name="website" tabindex="-1" autocomplete="off"></label></div>
        <label class="check"><input type="checkbox" name="privacy" required ${state.form.privacy ? "checked" : ""}>
          <span>He leído y acepto la <a href="privacidad.html" target="_blank">política de privacidad</a>. Usamos tus datos solo para gestionar la reserva.</span></label>
        ${state.fieldErrors.privacy ? `<p class="field__error" style="margin:-14px 0 18px">${esc(state.fieldErrors.privacy)}</p>` : ""}
        <button class="btn btn--cta btn--block btn--lg" type="submit" ${state.submitting ? "disabled" : ""}>
          ${state.submitting ? "Reservando…" : "Confirmar reserva"}
        </button>
      </form>`;
  }

  function viewStep3() {
    const r = state.result;
    const demoLink = isDemo() && r.demoCancelToken
      ? `<p style="margin-top:10px">Demo: <a href="cancelar.html?token=${encodeURIComponent(r.demoCancelToken)}">ver el enlace de cancelación</a> que recibiría el cliente.</p>` : "";
    return `
      <div class="done">
        <div class="done__seal" aria-hidden="true">✓</div>
        <h3 class="ticket__title">¡Mesa reservada!</h3>
        <ul class="done__list">
          <li><span>Día</span><strong>${esc(formatDateEs(state.date))}</strong></li>
          <li><span>Hora</span><strong>${esc(state.time)}</strong></li>
          <li><span>Personas</span><strong>${state.party}</strong></li>
          <li><span>A nombre de</span><strong>${esc(state.form.name)}</strong></li>
        </ul>
        <p>${isDemo() ? "En la versión real, el cliente recibe ahora un email de confirmación con un enlace para cancelar, y el restaurante recibe un aviso." : `Te hemos enviado la confirmación a <strong>${esc(state.form.email)}</strong>. Si no puedes venir, cancela desde ese email para liberar la mesa.`}</p>
        ${demoLink}
        <div class="actions" style="margin-top:22px">
          <button type="button" class="btn-text" data-again>Hacer otra reserva</button>
        </div>
      </div>`;
  }

  function render() {
    const active = document.activeElement;
    const focusKey = active && root.contains(active)
      ? (active.dataset.party && `[data-party="${active.dataset.party}"]`) ||
        (active.dataset.date && `[data-date="${active.dataset.date}"]`) ||
        (active.dataset.time && `[data-time="${active.dataset.time}"]`) ||
        (active.id && `#${active.id}`)
      : null;

    root.innerHTML = state.step === 1 ? viewStep1() : state.step === 2 ? viewStep2() : viewStep3();

    if (focusKey) root.querySelector(focusKey)?.focus({ preventScroll: true });
    const sel = root.querySelector('.chip--day[aria-pressed="true"]');
    if (sel && state.step === 1) {
      const sc = sel.parentElement;
      const l = sel.offsetLeft - sc.offsetLeft;
      if (l < sc.scrollLeft || l > sc.scrollLeft + sc.clientWidth - sel.offsetWidth) sc.scrollLeft = l - 8;
    }
  }

  function goStep(n) {
    state.step = n;
    state.error = "";
    render();
    root.classList.remove("step-enter");
    void root.offsetWidth;
    root.classList.add("step-enter");
    const top = root.getBoundingClientRect().top;
    if (top < 60 || top > innerHeight * 0.6) root.scrollIntoView({ behavior: "smooth", block: "start" });
    const first = root.querySelector(n === 2 ? "#bk-name" : n === 3 ? "[data-again]" : "[data-party]");
    first?.focus({ preventScroll: true });
  }

  // ---------- Eventos (delegados) ----------
  root.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t || t.disabled) return;
    if (t.dataset.party) { state.party = Number(t.dataset.party); return load(); }
    if (t.dataset.date) { state.date = t.dataset.date; state.customDate = false; return load(); }
    if ("otherDate" in t.dataset) { state.customDate = true; render(); root.querySelector("#bk-date")?.focus(); return; }
    if (t.dataset.time) { state.time = t.dataset.time; state.serviceLabel = t.dataset.serviceLabel; return render(); }
    if ("next" in t.dataset) return goStep(2);
    if ("back" in t.dataset) { goStep(1); return load(); }
    if ("again" in t.dataset) {
      state.result = null; state.time = null; state.fieldErrors = {};
      state.form = { name: state.form.name, phone: state.form.phone, email: state.form.email, notes: "" };
      goStep(1); return load();
    }
  });

  root.addEventListener("change", (e) => {
    if (e.target.id === "bk-date" && e.target.value) {
      state.date = e.target.value; state.customDate = true; load();
    }
  });

  root.addEventListener("input", (e) => {
    const f = e.target.form;
    if (!f || !e.target.name) return;
    if (e.target.type === "checkbox") state.form[e.target.name] = e.target.checked;
    else state.form[e.target.name] = e.target.value;
  });

  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(state.form, {
      name: fd.get("name") || "", phone: fd.get("phone") || "", email: fd.get("email") || "",
      notes: fd.get("notes") || "", privacy: fd.get("privacy") === "on",
    });
    state.fieldErrors = {};
    if (!state.form.privacy) {
      state.fieldErrors.privacy = "Necesitamos tu aceptación para guardar la reserva.";
      render(); return;
    }
    state.submitting = true; state.error = "";
    render();
    try {
      const res = await reserve({
        date: state.date, time: state.time, party: state.party,
        name: state.form.name, phone: state.form.phone, email: state.form.email, notes: state.form.notes,
        website: fd.get("website") || "",
      });
      state.result = res;
      state.submitting = false;
      goStep(3);
    } catch (err) {
      state.submitting = false;
      const fields = err.data?.fields;
      if (fields) state.fieldErrors = fields;
      if (fields?.date || fields?.time || fields?.party || err.status === 409 || (!fields && /hora|complet|cerrad|fecha/i.test(err.message))) {
        // la hora ya no vale: volvemos al paso 1 con el aviso
        const msg = err.message;
        goStep(1);
        await load();
        state.error = "";
        root.querySelector("[aria-live]")?.insertAdjacentHTML("afterbegin", `<p class="msg msg--error" style="margin-bottom:12px">${esc(msg)}</p>`);
        return;
      }
      state.error = fields ? "Revisa los campos marcados." : err.message;
      render();
      root.querySelector('[aria-invalid="true"]')?.focus();
    }
  });

  load();
}
