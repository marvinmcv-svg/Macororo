# Macororó 16 | 17 · City Park — Web + Live Explorer

Marketing site and interactive sales explorer for **Macororó 16 | 17** (Grupo Macororó), Av. Beni, Santa Cruz de la Sierra.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in dist/ (deploy to Vercel/Netlify/any static host)
```

## What's inside

| Route | What it is |
|---|---|
| `#/` | Landing: real-photo hero, typologies, real walkthrough, interiors gallery, amenities (day/night), location times, track record, WhatsApp lead form |
| `#/explorar` | Full-screen explorer app on the real drone photograph: every unit is mapped onto its floor of the actual facade and color-coded (disponible / reservado / vendido), with time-of-day grading, filters, floor & unit drill-down, plans, interiors, balcony view by time of day, amenities masterplan, location routes, sun simulation, saved units & compare |

Explorer state is shareable via URL, e.g. `#/explorar?unidad=16-24A&tab=vista`, `#/explorar?torre=16&piso=24`, `#/explorar?modo=amenidades&a=piscina`.

## Data — action required before launch

- `src/data/units.ts` → **inventory is a deterministic demo dataset** (calibrated on the public listing: 3D · 103 m² · piso 24 · $us 165.000). Replace `buildInventory()` with the real sales inventory (CRM / Supabase / spreadsheet).
- Plans: only the 1-dormitorio plan was supplied; 2–4 dorm plans render as referential schematics (`PlanSVG` in `src/components/ViewSim.tsx`). Drop official plans into `public/media/` and point `TYPOLOGIES[n].plan` at them.
- `src/data/project.ts` → copy, contact, amenities, travel times (sourced from macororo.com).

## Media

The facade mapping lives in `GEO` in `src/components/RealStage.tsx` (measured on `public/media/aerial-site.webp`). If you swap the photo, re-measure those values. In that photo Torre 16 floors 6–9 sit behind the podium, so they're selectable from the list only.


`public/media/` — from the project Drive folder; RE/MAX watermarks removed by cropping/inpainting. The two 17–34 MB drone videos were not included (too large for the Drive connector); add them as `public/media/*.mp4` if wanted.
