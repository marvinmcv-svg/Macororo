// Project facts sourced from macororo.com (Macororó 16 | 17 page), Grupo Macororó's
// Instagram and the media kit in the shared Drive folder.

export const M = (file: string) => `/media/${file}`;

export const PROJECT = {
  name: 'Macororó 16 | 17',
  tagline: 'City Park',
  developer: 'Grupo Macororó',
  floors: 37,
  towers: 2,
  address: 'Av. Beni entre 2do y 3er anillo, Zona Norte',
  addressShort: 'Av. Beni · Zona Norte',
  city: 'Santa Cruz de la Sierra, Bolivia',
  coords: { lat: -17.7682276, lng: -63.1775208 },
  mapsUrl:
    'https://www.google.com/maps/place/Macororo+16+y+17+City+Park/@-17.7682276,-63.1800957,859m/data=!3m2!1e3!4b1!4m6!3m5!1s0x93f1e7fbe4395b0f:0x9608d5fd709b1e76!8m2!3d-17.7682276!4d-63.1775208',
  intro:
    'Un proyecto icónico que transforma el skyline de Santa Cruz. Dos imponentes torres de 37 pisos, unidas por un innovador puente estructural, redefinen el concepto de altura, diseño y seguridad.',
  structure:
    'Su estructura ha sido diseñada con tecnología sismo resistente, garantizando la máxima seguridad en cada detalle.',
  views:
    'Desde cada ventana de Macororó 16-17, la ciudad se despliega ante tus ojos en una perspectiva única. Vistas espectaculares de Santa Cruz, que enmarcan cada momento con una postal inolvidable.',
  amenitiesIntro:
    'Un estilo de vida elevado. Espacios cuidadosamente creados para el descanso, la recreación y el ejercicio: cada detalle está pensado para ofrecer una experiencia inigualable.',
  locationIntro:
    'Conectado con lo mejor de Santa Cruz. Macororó 16-17 te sitúa cerca de todo: centros comerciales, restaurantes, colegios y servicios esenciales.',
};

export const CONTACT = {
  whatsapp: '59170854480',
  phones: ['+591 7085448', '+591 3405624'],
  email: 'info@macororo.com',
  office: 'Av. Busch, entre 2do y 3er Anillo, Edif. Macororó 8 — Área de oficinas, Piso 15, Oficina 1',
  hours: ['Lun–Vie 8:00 – 18:30', 'Sáb 8:30 – 12:00'],
  instagram: 'https://www.instagram.com/grupo.macororo/',
  facebook: 'https://www.facebook.com/grupomacororo',
  website: 'https://www.macororo.com/',
};

export const waLink = (text: string) =>
  `https://api.whatsapp.com/send?phone=${CONTACT.whatsapp}&text=${encodeURIComponent(text)}`;

export const TRACK_RECORD = [
  { value: 194683.18, decimals: 2, label: 'm² construidos' },
  { value: 3869, decimals: 0, label: 'Inmuebles entregados' },
  { value: 18, decimals: 0, label: 'Proyectos desarrollados' },
  { value: 25, decimals: 0, label: 'Años construyendo' },
];

export type Amenity = {
  id: string;
  name: string;
  short: string;
  img: string;
  night?: string;
  clip?: string; // real footage loop
  desc: string;
  // hotspot position on masterplan.webp in % (x, y)
  spot: [number, number];
};

export const AMENITIES: Amenity[] = [
  {
    id: 'piscina',
    name: 'Piscina atemperada',
    short: 'Piscina',
    clip: M('clips/piscina.mp4'),
    img: M('pool-indoor.webp'),
    night: M('pool-night.webp'),
    desc: 'Piscina climatizada interior con ventanales de piso a techo y luz natural.',
    spot: [63, 52],
  },
  {
    id: 'spa',
    name: 'Sauna & jacuzzi',
    short: 'Spa',
    clip: M('clips/spa.mp4'),
    img: M('spa.webp'),
    desc: 'Sauna, jacuzzi y carril de nado bajo iluminación cálida.',
    spot: [70, 48],
  },
  {
    id: 'deck',
    name: 'Piscina infinita',
    short: 'Piscina infinita',
    clip: M('clips/deck.mp4'),
    img: M('lap-pool.webp'),
    desc: 'Piscina al aire libre en el podio, con la ciudad de fondo.',
    spot: [34, 56],
  },
  {
    id: 'gimnasio',
    name: 'Gimnasio equipado',
    short: 'Gimnasio',
    clip: M('clips/gimnasio.mp4'),
    img: M('gym.webp'),
    desc: 'Cardio, pesas y área funcional con vista a la ciudad.',
    spot: [69, 65],
  },
  {
    id: 'playroom',
    name: 'Parque infantil & terraza',
    short: 'Parque infantil',
    clip: M('clips/playroom.mp4'),
    img: M('playroom.webp'),
    desc: 'Juegos para los más chicos y terraza verde en el podio.',
    spot: [78, 55],
  },
  {
    id: 'eventos',
    name: 'Churrasquera & salón de eventos',
    short: 'Eventos',
    clip: M('clips/eventos.mp4'),
    img: M('social.webp'),
    desc: 'Churrasquera cerrada y mesa comunal para recibir sin límites.',
    spot: [37, 27],
  },
];

export type Place = { id: string; name: string; minutes: number; icon: string; to: [number, number] };

// Travel times from macororo.com; `to` is an approximate target on aerial-city.webp (%).
export const NEARBY: Place[] = [
  { id: 'cristo', name: 'Cristo Redentor', minutes: 2, icon: '✝', to: [20, 38] },
  { id: 'resto', name: 'Restaurantes', minutes: 2, icon: '🍽', to: [44, 66] },
  { id: 'super', name: 'Supermercados', minutes: 2, icon: '🛒', to: [72, 60] },
  { id: 'colegios', name: 'Centros educativos', minutes: 4, icon: '🎓', to: [83, 33] },
  { id: 'bancos', name: 'Bancos', minutes: 4, icon: '🏦', to: [50, 86] },
];

export const ORIGIN_PIN: [number, number] = [55, 40];

export const GALLERY = [
  { img: M('living.webp'), title: 'Living-comedor', tag: 'Interiores' },
  { img: M('kitchen.webp'), title: 'Cocina integrada', tag: 'Interiores' },
  { img: M('living-1d.webp'), title: 'Depto. 1 dormitorio', tag: 'Interiores' },
  { img: M('bedroom-night.webp'), title: 'Dormitorio · noche', tag: 'Interiores' },
  { img: M('bathroom.webp'), title: 'Baño entregado', tag: 'Terminaciones' },
  { img: M('tower-entrance.webp'), title: 'Acceso principal', tag: 'Arquitectura' },
];
