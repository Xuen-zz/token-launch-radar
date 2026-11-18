import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const [browser, preview = 'preview', destination = 'screenshots'] = process.argv.slice(2)
if (!browser || !existsSync(browser)) throw Error('Usage: node tools/capture.mjs <Edge or Chromium executable> [preview] [screenshots]')
const board = JSON.parse(readFileSync(join(preview, 'board.json'), 'utf8'))
if (board.demo) throw Error('Competition screenshots must use the sealed official snapshot.')
const categories = new Map()
for (const row of board.rows.filter(row => row.watchlist)) categories.set(row.category, (categories.get(row.category) ?? 0) + 1)
const category = [...categories].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
const views = [
  { name: '1-board.png', hash: '', description: 'Default launch research board' },
  { name: '2-detail.png', hash: 'protocol=' + encodeURIComponent(board.rows[0].slug), description: 'Top-ranked protocol, route, costs and evidence' },
  { name: '3-filtered.png', hash: 'watchlist=' + encodeURIComponent(category), description: 'Official watchlist filtered by ' + category },
]
// Optional isolated local-file test mode for Windows hosts that cannot launch
// Chromium's nested sandbox. The agent host's restrictions still apply.
const localTestFlags = process.env.RADAR_LOCAL_BROWSER_TEST === '1' ? ['--no-sandbox'] : []
mkdirSync(destination, { recursive: true })
for (const view of views) {
  const temporary = mkdtempSync(join(tmpdir(), 'radar-view-'))
  const capture = join(temporary, 'view.png')
  const url = pathToFileURL(resolve(preview, 'dashboard', 'index.html')).href + '#' + view.hash
  const child = spawn(browser, [
    ...localTestFlags,
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-component-update', '--disable-gpu', '--in-process-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1360,900', '--virtual-time-budget=2000',
    '--user-data-dir=' + join(temporary, 'profile'), '--screenshot=' + capture, url,
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let diagnostics = ''
  let launchError
  child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-2000) })
  child.on('error', error => { launchError = error })
  try {
    let png
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      if (launchError) throw launchError
      try {
        const bytes = readFileSync(capture)
        if (bytes.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) { png = bytes; break }
      } catch (error) {
        if (!['ENOENT', 'EBUSY'].includes(error.code)) throw error
      }
      await delay(100)
    }
    if (!png) throw Error('No complete rendered capture: ' + diagnostics)
    if (png.readUInt32BE(16) !== 1360 || png.readUInt32BE(20) !== 900 || png.length > 350 * 1024) throw Error('Screenshot exceeds the planned dimensions or dossier budget.')
    copyFileSync(capture, join(destination, view.name))
    console.log(JSON.stringify({ ...view, width: 1360, height: 900, bytes: png.length, url }))
  } finally {
    if (child.exitCode === null) child.kill()
    child.stderr.destroy()
    child.unref()
  }
}
