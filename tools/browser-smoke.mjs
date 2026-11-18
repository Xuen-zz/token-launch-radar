import { spawn } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [browser, preview = 'preview'] = process.argv.slice(2)
if (!browser) throw Error('Usage: node tools/browser-smoke.mjs <browser executable> [preview]')
const temporary = mkdtempSync(join(tmpdir(), 'radar-smoke-'))
const site = join(temporary, 'site')
cpSync(resolve(preview), site, { recursive: true })
const index = join(site, 'dashboard', 'index.html')
writeFileSync(index, readFileSync(index, 'utf8').replace('</head>', '<script defer src="browser-assertions.js"></script></head>'))
cpSync(fileURLToPath(new URL('./browser-assertions.js', import.meta.url)), join(site, 'dashboard', 'browser-assertions.js'))
const child = spawn(browser, [
  ...(process.env.RADAR_LOCAL_BROWSER_TEST === '1' ? ['--no-sandbox'] : []),
  '--headless=new', '--disable-gpu', '--in-process-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-component-update',
  '--user-data-dir=' + join(temporary, 'profile'), '--window-size=1360,900', '--virtual-time-budget=3000',
  '--dump-dom', pathToFileURL(index).href,
], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
let html = ''
let errors = ''
child.stdout.on('data', chunk => { html += chunk })
child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-1500) })
const timeout = setTimeout(() => child.kill(), 25000)
try {
  await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
  const match = html.match(/<pre id="smoke-result">([^<]*)<\/pre>/)
  if (!match) throw Error('No browser test result: ' + errors)
  const report = JSON.parse(match[1].replaceAll('&amp;', '&').replaceAll('&gt;', '>').replaceAll('&lt;', '<'))
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
} finally { clearTimeout(timeout) }
