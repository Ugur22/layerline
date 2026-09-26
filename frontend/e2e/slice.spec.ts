import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const SAMPLES = path.resolve(import.meta.dirname, '../../samples')

function sample(name: string): Buffer {
  return readFileSync(path.join(SAMPLES, name))
}

// Unique names keep the tests independent of whatever the development database already holds.
function uniqueName(label: string, extension = 'geojson'): string {
  return `e2e-${label}-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}.${extension}`
}

function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

async function upload(page: Page, sampleFile: string, name: string) {
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: name.endsWith('.csv') ? 'text/csv' : 'application/geo+json',
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
  const stem = stemOf(name)
  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(name) })).toContainText('Succeeded')
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible()
  // Ready means the map went idle with our layer loaded, which requires a working worker.
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()
  expect(problems).toEqual([])
})

test('the property filter narrows the map and can be cleared', async ({ page }) => {
  const name = uniqueName('filter')
  const stem = stemOf(name)
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
  await expect(page.getByText(`${stemOf(older)} · 5 points`)).toBeVisible()
  await upload(page, 'good.geojson', newer)
  await expect(page.getByText(`${stemOf(newer)} · 2 points`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(older) })).toBeVisible()
  await page.getByRole('button', { name: new RegExp(older) }).click()

  await expect(page.getByText(`${stemOf(older)} · 5 points`)).toBeVisible()
  await expect(page.getByRole('button', { name: new RegExp(older) })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a CSV upload becomes a layer that can be filtered', async ({ page }) => {
  const name = uniqueName('csv', 'csv')
  const stem = stemOf(name)

  await upload(page, 'survey-points.csv', name)

  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()
  await page.getByLabel('Property').selectOption('type')
  await page.getByLabel('Equals').fill('buoy')
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await expect(page.getByText(`${stem} · showing 2 of 5 points`)).toBeVisible()
})

test('colouring by a property shows a legend and keeps it while filtering', async ({ page }) => {
  const name = uniqueName('colour', 'csv')
  const stem = stemOf(name)

  await upload(page, 'survey-points.csv', name)
  await expect(page.getByText(`${stem} · 5 points`)).toBeVisible()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  await page.getByLabel('Colour by').selectOption('type')
  await expect(page.getByRole('group', { name: 'Legend for type' })).toContainText('buoy')

  await page.getByLabel('Property').selectOption('type')
  await page.getByLabel('Equals').fill('buoy')
  await page.getByRole('button', { name: 'Apply filter' }).click()
  await expect(page.getByText(`${stem} · showing 2 of 5 points`)).toBeVisible()
  await expect(page.getByRole('group', { name: 'Legend for type' })).toContainText('mooring')
})

test('sizing points by a number draws without map errors and shows a size legend', async ({
  page,
}) => {
  const problems = watchBrowserHealth(page)
  const name = uniqueName('size', 'csv')

  await upload(page, 'survey-points.csv', name)
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  await page.getByLabel('Size by').selectOption('depth_m')
  await expect(page.getByRole('group', { name: 'Size legend for depth_m' })).toBeVisible()
  await page.getByLabel('Colour by').selectOption('type')
  await expect(page.getByRole('group', { name: 'Legend for type' })).toBeVisible()
  // Ready again means the map redrew with the data-driven radius and colour and went idle.
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()
  expect(problems).toEqual([])
})

test('clicking a point pins its properties in the inspector until the map is clicked elsewhere', async ({
  page,
}) => {
  const name = uniqueName('popup', 'csv')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('name,lat,lon,depth_m\nS-777,52.4,4.5,8.6\n'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  // A single point fits to the middle of the map, so the middle of the canvas is on the point.
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('map canvas has no box')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  const inspector = page.getByLabel('Point inspector')
  await expect(inspector).toContainText('Pinned point')
  await expect(inspector).toContainText('S-777')
  await expect(inspector).toContainText('8.6')

  await page.mouse.click(box.x + 8, box.y + box.height - 8)
  await expect(inspector).not.toContainText('S-777')
  await expect(inspector).toContainText('Hover a point')
})

test('hovering a point shows a short tooltip that goes away when the pointer leaves', async ({
  page,
}) => {
  const problems = watchBrowserHealth(page)
  const name = uniqueName('hover', 'csv')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('name,lat,lon,depth_m\nS-778,52.4,4.5,8.6\n'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('map canvas has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)

  const tooltip = page.locator('.layer-tooltip')
  await expect(tooltip).toContainText('S-778')
  await expect(tooltip).toContainText('8.6')

  await page.mouse.move(box.x + 8, box.y + box.height - 8)
  await expect(tooltip).toHaveCount(0)
  expect(problems).toEqual([])
})

test('hovering shows the point in the inspector and the tooltip alongside the pin', async ({
  page,
}) => {
  const problems = watchBrowserHealth(page)
  const name = uniqueName('pinned', 'csv')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('name,lat,lon,depth_m\nS-779,52.4,4.5,8.6\n'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('map canvas has no box')
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const inspector = page.getByLabel('Point inspector')

  await page.mouse.move(centre.x, centre.y)
  await expect(inspector).toContainText('Hovering')
  await expect(inspector).toContainText('S-779')

  await page.mouse.click(centre.x, centre.y)
  await page.mouse.move(box.x + 8, box.y + box.height - 8)
  await expect(inspector).toContainText('Pinned point')
  await expect(page.locator('.layer-tooltip')).toHaveCount(0)

  await page.mouse.move(centre.x, centre.y)
  await expect(page.locator('.layer-tooltip')).toContainText('S-779')
  expect(problems).toEqual([])
})

test('clicking a legend value hides those points from hover until clicked again', async ({
  page,
}) => {
  const problems = watchBrowserHealth(page)
  const name = uniqueName('legend', 'csv')
  await page.locator('input[type=file]').setInputFiles({
    name,
    mimeType: 'text/csv',
    buffer: Buffer.from('name,lat,lon,type\nS-780,52.4,4.5,buoy\n'),
  })
  await page.getByRole('button', { name: 'Upload' }).click()
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()

  await expect(page.getByLabel('Colour by')).toBeEnabled()
  await page.getByLabel('Colour by').selectOption('type')
  const canvas = page.locator('canvas.maplibregl-canvas')
  const box = await canvas.boundingBox()
  if (!box) throw new Error('map canvas has no box')
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const buoy = page.getByRole('group', { name: 'Legend for type' }).getByRole('button')
  const inspector = page.getByRole('region', { name: 'Point inspector' })

  await page.mouse.click(centre.x, centre.y)
  await expect(inspector).toContainText('S-780')
  await page.mouse.move(centre.x, centre.y)
  await expect(page.locator('.layer-tooltip')).toContainText('S-780')

  await buoy.click()
  await expect(buoy).toHaveAttribute('aria-pressed', 'false')
  await expect(inspector).toContainText('Hover a point')
  await expect(page.locator('[data-map-ready="true"]')).toBeVisible()
  await page.mouse.move(centre.x + 20, centre.y + 20)
  await page.mouse.move(centre.x, centre.y)
  await expect(page.locator('.layer-tooltip')).toHaveCount(0)

  await buoy.click()
  await expect(buoy).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.move(centre.x + 20, centre.y + 20)
  await page.mouse.move(centre.x, centre.y)
  await expect(page.locator('.layer-tooltip')).toContainText('S-780')
  expect(problems).toEqual([])
})

test('an invalid CSV reports spreadsheet row numbers', async ({ page }) => {
  await upload(page, 'bad-rows.csv', uniqueName('badcsv', 'csv'))

  await expect(page.getByText(/Import failed\. No features were saved/)).toBeVisible()
  await expect(page.getByText(/Row 3: Latitude is missing or not a number/)).toBeVisible()
  await expect(page.getByText(/Row 4: Expected 3 columns, found 2/)).toBeVisible()
  await expect(page.getByText(/Row 5: Coordinates are outside WGS84 range/)).toBeVisible()
  await expect(page.locator('canvas.maplibregl-canvas')).toHaveCount(0)
})
