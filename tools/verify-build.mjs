import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildDossier } from '../vendor/makefun-board.ts'

const [snapshotPath] = process.argv.slice(2)
if (!snapshotPath) throw Error('Usage: node tools/verify-build.mjs <official snapshot.json>')
const scratch = mkdtempSync(join(tmpdir(), 'radar-complete-'))
const snapshotBytes = readFileSync(snapshotPath)
const snapshot = JSON.parse(snapshotBytes)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'No symlinks: ' + entry.name)
    const relative = prefix + entry.name
    return entry.isDirectory() ? files(join(directory, entry.name), relative + '/') : [relative]
  })
}
const outputs = ['a', 'b'].map(name => join(scratch, name))
for (const output of outputs) {
  const run = spawnSync(process.execPath, ['main.ts', '--input', resolve(snapshotPath), '--output', output],
    { cwd: resolve('.'), windowsHide: true, timeout: 120000, encoding: 'utf8' })
  assert.ifError(run.error)
  assert.equal(run.status, 0, run.stderr)
}
const names = files(outputs[0])
assert.deepEqual(names, files(outputs[1]))
for (const name of names) assert.deepEqual(readFileSync(join(outputs[0], name)), readFileSync(join(outputs[1], name)), 'Nondeterministic: ' + name)
const output = outputs[0]
const boardBytes = readFileSync(join(output, 'board.json'))
const board = JSON.parse(boardBytes)
assert.equal(board.snapshot_sha256, digest(snapshotBytes))
assert.ok(boardBytes.length <= 8 * 1024 * 1024)
assert.ok(board.rows.length >= 100 && board.rows.length <= 4000)
const rows = [...board.rows].sort((a, b) => a.rank - b.rank)
const slugs = new Set(snapshot.protocols.map(protocol => protocol.slug))
assert.equal(new Set(rows.map(row => row.slug)).size, rows.length)
for (const [index, row] of rows.entries()) {
  assert.ok(slugs.has(row.slug) && row.name.trim())
  assert.equal(row.rank, index + 1)
  assert.ok(Number.isInteger(row.implied_value_usd) && row.implied_value_usd > 0 && row.implied_value_usd <= 1e14)
  if (index) assert.ok(row.implied_value_usd <= rows[index - 1].implied_value_usd)
  assert.ok(row.farm_steps.length >= 3 && row.farm_steps.length <= 12)
  for (const step of row.farm_steps) assert.ok(step.trim().length >= 20 && step.trim().length <= 600)
}
assert.ok(rows[0].implied_value_usd > rows.at(-1).implied_value_usd)
assert.ok(snapshot.watchlist.every(slug => rows.some(row => row.slug === slug)))
const dashboardFiles = files(join(output, 'dashboard'))
assert.ok(dashboardFiles.includes('index.html') && dashboardFiles.some(name => name.endsWith('.css')) && dashboardFiles.some(name => name.endsWith('.js')))
assert.ok(dashboardFiles.length <= 400)
let sourceBytes = 0
for (const relative of dashboardFiles) {
  for (const name of relative.split('/')) assert.match(name, /^[a-z\d_][a-z\d._-]{0,127}$/i)
  const bytes = readFileSync(join(output, 'dashboard', relative))
  sourceBytes += bytes.length
  const text = bytes.toString('utf8')
  if (relative.endsWith('.css')) assert.doesNotMatch(text, /https?:\/\//i)
  if (relative.endsWith('.html')) assert.doesNotMatch(text, /[\w:-]+\s*=\s*["']\s*https?:\/\//i)
  if (/\.[cm]?js$/.test(relative)) assert.doesNotMatch(text, /(?:import\s*\(|require\s*\(|from\s*)["']https?:\/\//i)
}
assert.ok(sourceBytes < 65536, 'Every dashboard source must fit the dossier text budget')
const captures = files(join(output, 'screenshots'))
assert.ok(captures.length >= 3 && captures.length <= 4)
const screenshots = captures.map(name => {
  const bytes = readFileSync(join(output, 'screenshots', name))
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20)
  assert.ok(bytes.length <= 524288 && Math.min(width, height) >= 800 && Math.max(width, height) <= 1440)
  return { name, bytes: bytes.length, width, height, sha256: digest(bytes) }
})
const dossier = readFileSync(join(output, 'dossier.json'))
assert.deepEqual(dossier, Buffer.from(buildDossier(output, { text_max_bytes: 65536 })))
assert.ok(dossier.length <= 1.5 * 1024 * 1024)
console.log(JSON.stringify({ ok: true, scope: 'Local output checks; not a server grade', deterministic_files: names.length,
  rows: rows.length, watchlist: snapshot.watchlist.length, related_assets: rows.filter(row => row.related_asset).length,
  implementation_records: rows.filter(row => row.farm.implementation).length, dashboard_source_bytes: sourceBytes,
  board_sha256: digest(boardBytes), dossier_bytes: dossier.length, dossier_sha256: digest(dossier), screenshots }, null, 2))
