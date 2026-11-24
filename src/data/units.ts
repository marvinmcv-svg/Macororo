// Inventory model for Macororó 16 | 17.
//
// IMPORTANT: availability and prices below are a deterministic DEMO dataset calibrated on the
// public listing (3 dorm · ~103 m² · piso 24 · $us 165.000). Replace `buildInventory()` with the
// real sales inventory (CRM / Supabase / spreadsheet export) before going live.

import { M } from './project';

export type TowerId = '16' | '17';
export type Status = 'disponible' | 'reservado' | 'vendido';
export type Typology = 1 | 2 | 3 | 4;

export type Unit = {
  id: string; // e.g. "16-24A"
  tower: TowerId;
  floor: number;
  letter: string;
  index: number; // position around the floor plate (0..n-1)
  perFloor: number;
  dorms: Typology;
  baths: number;
  area: number; // m²
  balcony: number; // m²
  price: number; // USD
  status: Status;
  orientation: string;
};

export const FIRST_RES_FLOOR = 6; // floors 1-5 = lobby, parking & amenity podium
export const TOP_FLOOR = 37;
export const BRIDGE_FLOOR = 21;

export const TYPOLOGIES: Record<
  Typology,
  { label: string; short: string; area: number; balcony: number; baths: number; plan: string; hero: string; blurb: string }
> = {
  1: {
    label: '1 dormitorio',
    short: '1D',
    area: 55,
    balcony: 3.2,
    baths: 1,
    plan: M('plan-1d.webp'),
    hero: M('living-1d.webp'),
    blurb: 'Suite con walk-in, living-comedor abierto y balcón curvo. Ideal para invertir y rentar.',
  },
  2: {
    label: '2 dormitorios',
    short: '2D',
    area: 82,
    balcony: 5.1,
    baths: 2,
    plan: M('plan-1d.webp'),
    hero: M('kitchen.webp'),
    blurb: 'Dos suites, cocina integrada con isla y balcón de esquina con doble vista.',
  },
  3: {
    label: '3 dormitorios',
    short: '3D',
    area: 103,
    balcony: 6.4,
    baths: 2,
    plan: M('plan-1d.webp'),
    hero: M('living.webp'),
    blurb: 'Living de doble fachada vidriada, tres dormitorios y área de servicio.',
  },
  4: {
    label: '4 dormitorios',
    short: '4D',
    area: 142,
    balcony: 9.8,
    baths: 3,
    plan: M('plan-1d.webp'),
    hero: M('social.webp'),
    blurb: 'Pisos altos, vistas 270° y espacios sociales generosos para recibir.',
  },
};

const ORIENT = ['Norte', 'Noreste', 'Este', 'Sudeste', 'Sur', 'Sudoeste', 'Oeste', 'Noroeste'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function layoutFor(floor: number): Typology[] {
  if (floor >= 34) return [4, 3, 3, 4];
  if (floor >= 28) return [3, 2, 2, 3, 4];
  return [3, 2, 1, 1, 2, 3];
}

const BASE_PER_M2 = 1450;

export function buildInventory(): Unit[] {
  const rnd = mulberry32(1617);
  const units: Unit[] = [];
  for (const tower of ['16', '17'] as TowerId[]) {
    for (let floor = FIRST_RES_FLOOR; floor <= TOP_FLOOR; floor++) {
      const layout = layoutFor(floor);
      layout.forEach((dorms, i) => {
        const t = TYPOLOGIES[dorms];
        const letter = String.fromCharCode(65 + i);
        const area = Math.round(t.area + (rnd() - 0.5) * 4);
        const premium = 1 + 0.006 * (floor - 5) + (tower === '17' ? 0.01 : 0);
        const price = Math.round((area * BASE_PER_M2 * premium) / 500) * 500;
        // Lower floors sell first; higher floors are more available (realistic absorption curve)
        const soldBias = 0.78 - (floor - FIRST_RES_FLOOR) * 0.012;
        const r = rnd();
        const status: Status = r < soldBias ? 'vendido' : r < soldBias + 0.07 ? 'reservado' : 'disponible';
        const orientIdx = Math.round((i / layout.length) * 8 + (tower === '16' ? 0 : 4)) % 8;
        units.push({
          id: `${tower}-${floor}${letter}`,
          tower,
          floor,
          letter,
          index: i,
          perFloor: layout.length,
          dorms,
          baths: t.baths,
          area,
          balcony: t.balcony,
          price,
          status,
          orientation: ORIENT[orientIdx],
        });
      });
    }
  }
  // Anchor the published listing: 3D · 103 m² · piso 24 · $us 165.000 available in Torre 16.
  const anchor = units.find((u) => u.id === '16-24A');
  if (anchor) Object.assign(anchor, { area: 103, price: 165000, status: 'disponible' as Status });
  return units;
}

export const INVENTORY = buildInventory();

export const fmtUSD = (n: number) => '$us ' + n.toLocaleString('es-BO', { maximumFractionDigits: 0 });
export const fmtK = (n: number) => '$' + Math.round(n / 1000) + 'k';

export type Filters = {
  tower: 'all' | TowerId;
  dorms: 0 | Typology;
  floorMin: number;
  floorMax: number;
  budgetMax: number;
  onlyAvailable: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  tower: 'all',
  dorms: 0,
  floorMin: FIRST_RES_FLOOR,
  floorMax: TOP_FLOOR,
  budgetMax: 400000,
  onlyAvailable: false,
};

export const matches = (u: Unit, f: Filters) =>
  (f.tower === 'all' || u.tower === f.tower) &&
  (f.dorms === 0 || u.dorms === f.dorms) &&
  u.floor >= f.floorMin &&
  u.floor <= f.floorMax &&
  u.price <= f.budgetMax &&
  (!f.onlyAvailable || u.status === 'disponible');

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  disponible: { label: 'Disponible', color: '#2BE35A' },
  reservado: { label: 'Reservado', color: '#F5B731' },
  vendido: { label: 'Vendido', color: '#E5484D' },
};
