// =============================================================
//  CONFIGURACIÓN DEL RESTAURANTE — el único archivo que cambias
//  por cliente (más colores en css/tokens.css y las fotos en img/).
//  Lo leen tanto la web como el servidor: una sola fuente de verdad.
// =============================================================

const config = {
  // ---------- Datos del negocio ----------
  restaurant: {
    name: "Fogó",
    tagline: "Cuina de brasa i mercat",
    description:
      "Restaurante de cocina a la brasa con producto de mercado. Plantilla demo: sustituye estos textos por los del cliente.",
    phone: "+34 600 000 000",          // [DEMO] teléfono real del cliente
    whatsapp: "34600000000",           // [DEMO] solo dígitos, con prefijo de país
    email: "reservas@ejemplo.com",     // [DEMO] email público del restaurante
    address: "Carrer de l'Exemple, 12, 08221 Terrassa", // [DEMO]
    mapsUrl: "https://maps.google.com/?q=Terrassa",     // [DEMO] enlace de Google Maps
    instagram: "",                     // ej. "https://instagram.com/usuario" (vacío = se oculta)
    siteUrl: "https://tu-proyecto.vercel.app",           // se usa en emails y SEO
  },

  // ---------- Horario visible en la web ----------
  openingHours: [
    { days: "Martes a jueves", hours: "13:00–16:00" },
    { days: "Viernes y sábado", hours: "13:00–16:00 · 20:00–23:30" },
    { days: "Domingo", hours: "13:00–16:30" },
    { days: "Lunes", hours: "Cerrado" },
  ],

  // ---------- Motor de reservas ----------
  reservations: {
    timezone: "Europe/Madrid",
    minParty: 1,
    maxParty: 8,              // grupos mayores → mensaje para llamar
    minNoticeMinutes: 90,     // antelación mínima para reservar online
    maxDaysAhead: 60,         // hasta cuántos días vista se puede reservar
    defaultDurationMinutes: 105, // informativo (se muestra en el email)

    // Turnos. days: 0=domingo, 1=lunes ... 6=sábado
    // capacityPerSlot: máx. personas que pueden LLEGAR en una misma franja
    // capacityPerService: máx. personas en todo el turno (aforo real)
    services: [
      {
        id: "comida",
        label: "Comida",
        days: [0, 2, 3, 4, 5, 6],
        start: "13:00",
        end: "15:15",          // última hora de llegada
        intervalMinutes: 15,
        capacityPerSlot: 12,
        capacityPerService: 48,
      },
      {
        id: "cena",
        label: "Cena",
        days: [5, 6],
        start: "20:00",
        end: "22:30",
        intervalMinutes: 15,
        capacityPerSlot: 12,
        capacityPerService: 48,
      },
    ],

    // Días cerrados fijos (festivos, vacaciones). Formato AAAA-MM-DD.
    // También se pueden bloquear desde el panel admin sin tocar código.
    closedDates: ["2026-12-25", "2027-01-01"],
  },

  // ---------- Carta (se pinta sola en la web) ----------
  menu: [
    {
      category: "Para compartir",
      items: [
        { name: "Pa amb tomàquet", description: "Pan de payés, tomate de colgar y aceite arbequina.", price: "4,50" },
        { name: "Croquetas de rustido", description: "Seis unidades, receta de la casa.", price: "9,00" },
        { name: "Escalivada a la brasa", description: "Berenjena, pimiento y cebolla con anchoa.", price: "11,00" },
      ],
    },
    {
      category: "De la brasa",
      items: [
        { name: "Entrecot de vaca madurada", description: "300 g, sal en escamas y patata confitada.", price: "26,00" },
        { name: "Pulpo a la brasa", description: "Parmentier ahumada y pimentón de la Vera.", price: "22,00" },
        { name: "Verduras de temporada", description: "Selección del mercado según el día.", price: "14,00" },
      ],
    },
    {
      category: "Postres",
      items: [
        { name: "Crema catalana", description: "Quemada al momento.", price: "6,50" },
        { name: "Tarta de queso", description: "Al horno, cremosa por dentro.", price: "7,00" },
      ],
    },
  ],
  menuNote: "Precios demo con IVA incluido. Consulta alérgenos al personal.",

  // ---------- Galería (pon las fotos en /img con estos nombres) ----------
  gallery: [
    { src: "img/galeria-1.webp", alt: "Sala del restaurante" },
    { src: "img/galeria-2.webp", alt: "Plato a la brasa" },
    { src: "img/galeria-3.webp", alt: "Barra y cocina" },
    { src: "img/galeria-4.webp", alt: "Postre de la casa" },
  ],
};

export default config;
