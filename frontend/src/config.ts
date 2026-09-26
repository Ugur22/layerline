// Dataset creation has no UI or endpoint yet, so the first slice targets the seeded dev dataset.
export const DEV_DATASET_ID =
  (import.meta.env.VITE_DEV_DATASET_ID as string | undefined) ??
  '00000000-0000-4000-8000-000000000003'
