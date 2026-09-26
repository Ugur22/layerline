// Dataset creation has no UI or endpoint yet, so the first slice targets the seeded dev dataset.
export const DEV_DATASET_ID =
  (import.meta.env.VITE_DEV_DATASET_ID as string | undefined) ??
  '00000000-0000-4000-8000-000000000003'

// Any MapLibre style URL works (ADR 0009); the default needs no API key. Re-check the provider's
// terms before using it beyond local development.
export const BASEMAP_STYLE_URL =
  (import.meta.env.VITE_BASEMAP_STYLE_URL as string | undefined) ??
  'https://tiles.openfreemap.org/styles/liberty'
