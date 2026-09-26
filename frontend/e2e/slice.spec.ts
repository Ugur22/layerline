import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const SAMPLES = path.resolve(import.meta.dirname, '../../samples')

function sample(name: string): Buffer {
  return readFileSync(path.join(SAMPLES, name))
}

// Unique names keep the tests independent of whatever the development database already holds.
function uniqueName(label: string): string {
  return `e2e-${label}-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}.geojson`
}

async function upload(page: Page, sampleFile: string, name: string) {
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'application/geo+json',
    buffer: sample(sampleFile),
  })
  await page.getByRole('button', { name: 'Upload' }).click()
}

// Browser-level health that unit tests cannot see: the map's worker failing to start is only
// reported as a console error (this once broke the map while every unit test passed).
function watchBrowserHealth(page: Page) {
  const problems: string[] = []
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`)
  })
  return problems
}

// A style with no sources: the map still needs its worker for our GeoJSON layer, but nothing
// depends on the network (ADR 0009 makes the style URL configurable for exactly this).
const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5e7eb' } }],
}

test.beforeEach(async ({ page }) => {
  await page.route('**/e2e-blank-style.json', (route) => route.fulfill({ json: BLANK_STYLE }))
  await page.goto('/')
})

test('a valid upload becomes a list entry and a rendered map', async ({ page }) => {
  const problems = watchBrowserHealth(page)
  const name = uniqueName('valid')

  await upload(page, 'survey-points.geojson', name)

  await expect(page.getByText('Import succeeded')).toBeVisible()
  const stem = name.replace('.geojson', '')
  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toContainText('Succeeded')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  // Ready means the map went idle with our layer loaded, which requires a working worker.
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()
  expect(problems).toEqual([])
})

test('the property filter narrows the map and can be cleared', async ({ page }) => {
  const name = uniqueName('filter')
  const stem = name.replace('.geojson', '')
  await upload(page, 'survey-points.geojson', name)
  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()

  await page.getByLabel('Property').selectOption('type')
  await page.getByLabel('Equals').fill('buoy')
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await expect(page.getByText(`${stem} · showing 2 of 5 points`)).toBeVisible()

  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()
})

test('an invalid upload fails with a per-feature error and no map', async ({ page }) => {
  const name = uniqueName('invalid')

  await upload(page, 'bad-longitude.geojson', name)

  await expect(page.getByText(/Import failed\. No features were saved/)).toBeVisible()
  await expect(page.getByText(/Feature 2: Coordinates are outside WGS84 range/)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toContainText('Failed')
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)
})

test('imports survive a reload and an older one can be reopened', async ({ page }) => {
  const older = uniqueName('older')
  const newer = uniqueName('newer')
  await upload(page, 'survey-points.geojson', older)
  await expect(page.getByText(`${older.replace('.geojson', '')} · 5 points`)).toBeVisible()
  await upload(page, 'good.geojson', newer)
  await expect(page.getByText(`${newer.replace('.geojson', '')} · 2 points`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(older) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(older) }).click()

  await expect(page.getByText(`${older.replace('.geojson', '')} · 5 points`)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(older) })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
