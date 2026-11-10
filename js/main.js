// =============================================================
//  main.js — pinta la web con los datos de site.config.js
//  y monta el widget de reservas. Sin librerías.
// =============================================================
import config from "../site.config.js";
import { mountBooking } from "./booking-widget.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const R = config.restaurant;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Si algo falla, que nunca deje la web a medias.
function safe(fn) { try { fn(); } catch (e) { console.error(e); } }

// ---------- Datos del negocio ----------
safe(() => {
  const map = {
    name: R.name, tagline: R.tagline, description: R.description, address: R.address,
    maxParty: String(config.reservations.maxParty),
  };
  $$("[data-r]").forEach((el) => { const v = map[el.dataset.r]; if (v) el.textContent = v; });
  const tel = `tel:${R.phone.replace(/[^\d+]/g, "")}`;
  $$("[data-r-tel]").forEach((a) => { a.href = tel; a.textContent = R.phone; });
  $$("[data-r-mail]").forEach((a) => { a.href = `mailto:${R.email}`; a.textContent = R.email; });
  $$("[data-r-maps]").forEach((a) => (a.href = R.mapsUrl));
  $$("[data-r-wa]").forEach((a) => {
    a.href = `https://wa.me/${R.whatsapp}?text=${encodeURIComponent(`Hola ${R.name}, quería hacer una consulta.`)}`;
  });
  if (R.instagram) {
    $$("[data-r-ig]").forEach((a) => (a.href = R.instagram));
    $$("[data-r-ig-wrap]").forEach((li) => (li.hidden = false));
  }
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
});

// ---------- Carta ----------
safe(() => {
  const box = $("[data-menu]");
  if (!box) return;
  box.innerHTML = "";
  for (const cat of config.menu) {
    const col = document.createElement("div");
    col.className = "carta__cat";
    col.setAttribute("data-reveal", "");
    const h = document.createElement("h3");
    h.textContent = cat.category;
    col.append(h);
    for (const it of cat.items) {
      const p = document.createElement("div");
      p.className = "plato";
      p.innerHTML = `<div class="plato__top"><span class="plato__name"></span><span class="plato__dots" aria-hidden="true"></span><span class="plato__price"></span></div><p class="plato__desc"></p>`;
      $(".plato__name", p).textContent = it.name;
      $(".plato__price", p).textContent = it.price;
      $(".plato__desc", p).textContent = it.description || "";
      if (!it.description) $(".plato__desc", p).remove();
      col.append(p);
    }
    box.append(col);
  }
  const note = $("[data-menu-note]");
  if (note) note.textContent = config.menuNote || "";
});

// ---------- Galería (con hueco elegante si aún no hay foto) ----------
safe(() => {
  const box = $("[data-gallery]");
  if (!box) return;
  box.innerHTML = "";
  config.gallery.forEach((g, i) => {
    const fig = document.createElement("figure");
    fig.setAttribute("data-reveal", "");
    const img = new Image();
    img.alt = g.alt;
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      fig.classList.add("is-empty");
      fig.innerHTML = `<figcaption><strong></strong>Sube <code>${g.src.split("/").pop()}</code> a /img</figcaption>`;
      fig.querySelector("strong").textContent = g.alt;
    };
    img.src = g.src;
    fig.append(img);
    if (i === 0) fig.style.transitionDelay = "0s";
    box.append(fig);
  });
});

// ---------- Horario ----------
safe(() => {
  const dl = $("[data-hours]");
  if (!dl) return;
  dl.innerHTML = "";
  for (const h of config.openingHours) {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = h.days;
    dd.textContent = h.hours;
    row.append(dt, dd);
    dl.append(row);
  }
});

// ---------- Cabecera sólida al bajar ----------
safe(() => {
  const nav = $("[data-nav]");
  const onScroll = () => nav.classList.toggle("is-solid", scrollY > 40);
  onScroll();
  addEventListener("scroll", onScroll, { passive: true });
});

// ---------- Entrada de la portada (con respaldo por tiempo) ----------
safe(() => {
  const hero = $(".hero");
  const go = () => hero.classList.add("is-in");
  if (reduced) return go();
  requestAnimationFrame(() => requestAnimationFrame(go));
  setTimeout(go, 1200); // respaldo
});

// ---------- Revelado al hacer scroll ----------
safe(() => {
  const els = $$("[data-reveal]");
  if (reduced || !("IntersectionObserver" in window)) return els.forEach((el) => el.classList.add("is-visible"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
    }),
    { rootMargin: "0px 0px -10% 0px" }
  );
  els.forEach((el, i) => {
    if (el.parentElement?.matches("[data-menu], [data-gallery]")) el.style.transitionDelay = `${(i % 3) * 90}ms`;
    io.observe(el);
  });
});

// ---------- Barra fija de móvil: se oculta en la portada y en reservas ----------
safe(() => {
  const bar = $("[data-sticky-cta]");
  const reservar = $("#reservar");
  const hero = $(".hero");
  if (!bar || !("IntersectionObserver" in window)) return;
  const state = { hero: true, reservar: false };
  const update = () => bar.classList.toggle("is-hidden", state.hero || state.reservar);
  new IntersectionObserver(([e]) => { state.hero = e.isIntersecting; update(); }, { threshold: 0.35 }).observe(hero);
  new IntersectionObserver(([e]) => { state.reservar = e.isIntersecting; update(); }, { threshold: 0.05 }).observe(reservar);
  update();
});

// ---------- Widget de reservas ----------
safe(() => {
  const el = $("[data-booking]");
  if (el) mountBooking(el, { badge: $("[data-demo-badge]") });
});
