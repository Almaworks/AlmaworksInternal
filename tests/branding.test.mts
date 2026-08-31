import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = new URL('../', import.meta.url)

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, root), 'utf8')
}

test('shared Almaworks brand supports full, compact, black, and white treatments', () => {
  const source = read('components/AlmaworksBrand.tsx')

  assert.match(source, /compact\?: boolean/)
  assert.match(source, /tone\?: 'black' \| 'white'/)
  assert.match(source, /almaworks-laurel-black\.png/)
  assert.match(source, /almaworks-laurel-white\.png/)
  assert.match(source, />Almaworks</)
})

test('brand assets and primary surfaces use the shared mark', () => {
  assert.equal(existsSync(new URL('public/images/almaworks-laurel-black.png', root)), true)
  assert.equal(existsSync(new URL('public/images/almaworks-laurel-white.png', root)), true)

  for (const path of [
    'app/page.tsx',
    'app/dashboard/layout.tsx',
    'app/learn-more/page.tsx',
    'app/pending/page.tsx',
    'app/dashboard/onboarding/onboarding-flow.tsx',
  ]) {
    assert.match(read(path), /AlmaworksBrand/, `${path} should use AlmaworksBrand`)
  }
})

test('favicon is a transparent PNG with a black laurel mark', async () => {
  const faviconPath = fileURLToPath(new URL('app/icon.png', root))
  const image = sharp(faviconPath)
  const metadata = await image.metadata()
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  assert.equal(metadata.format, 'png')
  assert.equal(metadata.hasAlpha, true)

  let transparentPixels = 0
  let opaquePixels = 0
  let blackOpaquePixels = 0

  for (let index = 0; index < data.length; index += info.channels) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const alpha = data[index + 3]

    if (alpha === 0) transparentPixels += 1
    if (alpha > 200) {
      opaquePixels += 1
      if (red < 20 && green < 20 && blue < 20) blackOpaquePixels += 1
    }
  }

  assert.ok(transparentPixels > 0, 'favicon should retain a transparent background')
  assert.ok(opaquePixels > 0, 'favicon should contain visible artwork')
  assert.ok(blackOpaquePixels / opaquePixels > 0.98, 'visible favicon artwork should be black')
})
