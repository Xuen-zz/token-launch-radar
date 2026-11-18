import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildEstimator, candidates } from './reference/model.ts'
import type { Snapshot } from './reference/model.ts'
import { farmPlan } from './reference/farm.ts'
import { productEvidence } from './reference/evidence.ts'
import { buildDossier } from './vendor/makefun-board.ts'

// The reviewed estimator, farm scenarios and evidence are attributed in PROVENANCE.md.
// This entrypoint recomputes the board from the supplied snapshot on every run.
const project = dirname(fileURLToPath(import.meta.url))

function options(argv: string[]) {
  const result = new Map<string, string>()
  let preview = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--preview') {
      preview = true
      continue
    }
    const equals = arg.indexOf('=')
    const key = equals === -1 ? arg : arg.slice(0, equals)
    if (!['--input', '--output', '--screenshots'].includes(key)) throw Error('Unknown option: ' + key)
    if (result.has(key)) throw Error('Duplicate option: ' + key)
    const value = equals === -1 ? argv[++index] : arg.slice(equals + 1)
    if (!value || value.startsWith('--')) throw Error('A path is required for ' + key)
    result.set(key, value)
  }
  const input = resolve(result.get('--input') ?? '/input/snapshot.json')
  return {
    preview,
    input: input.endsWith('.json') ? input : join(input, 'snapshot.json'),
    output: resolve(result.get('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? (preview ? join(project, 'preview') : '/output')),
    screenshots: resolve(result.get('--screenshots') ?? join(project, 'screenshots')),
  }
}

function loadSnapshot(path: string) {
  const bytes = readFileSync(path)
  const snapshot = JSON.parse(bytes.toString('utf8')) as Snapshot
  if (!Array.isArray(snapshot.protocols) || !Array.isArray(snapshot.watchlist) ||
      !Number.isFinite(Date.parse(snapshot.as_of))) throw Error('Invalid snapshot envelope.')
  const unique = new Set<string>()
  for (const protocol of snapshot.protocols) {
    if (!protocol.slug || !protocol.name || unique.has(protocol.slug) ||
        !Number.isFinite(protocol.tvl_usd) || protocol.tvl_usd <= 0 ||
        !Array.isArray(protocol.chains) || protocol.chains.some(chain => typeof chain !== 'string')) {
      throw Error('Invalid or duplicate protocol: ' + protocol.slug)
    }
    unique.add(protocol.slug)
  }
  if (new Set(snapshot.watchlist).size !== snapshot.watchlist.length ||
      snapshot.watchlist.some(slug => !unique.has(slug))) throw Error('Invalid watchlist membership.')
  return { snapshot, digest: createHash('sha256').update(bytes).digest('hex') }
}

function assembleBoard(snapshot: Snapshot, digest: string) {
  const watchlist = new Set(snapshot.watchlist)
  const estimator = buildEstimator(snapshot)
  const eligible = candidates(snapshot)
  const bands = estimator.rankBands(eligible)
  const rows = eligible.map(protocol => {
    const { slug, name, chains, tvl_usd, change_7d, listed_at } = protocol
    return {
      slug, name, category: protocol.category ?? 'Unclassified', chains,
      tvl_usd, change_7d, listed_at, watchlist: watchlist.has(slug),
      related_asset: productEvidence[slug] ?? null, rank_band: bands.get(slug),
      ...estimator.price(protocol), ...farmPlan(protocol),
    }
  })
  rows.sort((left, right) => right.implied_value_usd - left.implied_value_usd ||
    (left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0))
  const ranked = rows.map((row, index) => ({ rank: index + 1, ...row }))
  if (ranked.length < 100 || ranked.length > 4000 ||
      ranked[0].implied_value_usd === ranked.at(-1)!.implied_value_usd) throw Error('Invalid board size or value ordering.')
  for (const row of ranked) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0 ||
        row.farm_steps.length < 3 || row.farm_steps.length > 12 ||
        row.farm_steps.some(step => step.trim().length < 20 || step.trim().length > 600)) {
      throw Error('Invalid board fields: ' + row.slug)
    }
  }
  if (ranked.filter(row => row.watchlist).length !== watchlist.size) throw Error('Incomplete watchlist coverage.')
  const recorded = snapshot.protocols.filter(protocol => protocol.gecko_id || protocol.symbol || protocol.mcap_usd != null).length
  return {
    as_of: snapshot.as_of,
    source: 'Make.fun competition snapshot',
    demo: false,
    snapshot_sha256: digest,
    watchlist_size: watchlist.size,
    valuation: 'Conditional circulating market cap proxy in USD',
    validation: estimator.validation,
    rows: ranked,
    recorded_token_count: recorded,
    no_token_excluded: snapshot.protocols.length - ranked.length - recorded,
  }
}

function screenshotFiles(directory: string) {
  if (!existsSync(directory)) throw Error('Capture three dashboard views before a full build, or use --preview.')
  const entries = readdirSync(directory, { withFileTypes: true }).filter(entry => !entry.name.startsWith('.'))
  if (entries.length < 3 || entries.length > 4) throw Error('Three or four screenshots are required.')
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-z0-9_][a-z0-9._-]{0,127}\.png$/i.test(entry.name)) throw Error('Expected a PNG capture: ' + entry.name)
    const png = readFileSync(join(directory, entry.name))
    if (png.length < 33 || png.length > 524288 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        !png.subarray(-12).equals(Buffer.from('0000000049454e44ae426082', 'hex'))) throw Error('Incomplete or oversized capture: ' + entry.name)
    const width = png.readUInt32BE(16)
    const height = png.readUInt32BE(20)
    if (Math.min(width, height) < 800 || Math.max(width, height) > 1440) throw Error('Capture dimensions out of bounds: ' + entry.name)
  }
  return entries.map(entry => entry.name).sort()
}

const config = options(process.argv.slice(2))
if ([project, join(project, 'dashboard'), join(project, 'reference'), join(project, 'vendor')].includes(config.output)) {
  throw Error('Choose a separate output directory to preserve entry sources.')
}
const captures = config.preview ? [] : screenshotFiles(config.screenshots)
const { snapshot, digest } = loadSnapshot(config.input)
const board = assembleBoard(snapshot, digest)
mkdirSync(config.output, { recursive: true })
cpSync(join(project, 'dashboard'), join(config.output, 'dashboard'), { recursive: true })
writeFileSync(join(config.output, 'board.json'), JSON.stringify(board, null, 2) + '\n')
writeFileSync(join(config.output, 'data.js'), 'window.RADAR_DATA = ' + JSON.stringify(board).replaceAll('<', '\\u003c') + ';\n')
if (!config.preview) {
  mkdirSync(join(config.output, 'screenshots'), { recursive: true })
  for (const name of captures) cpSync(join(config.screenshots, name), join(config.output, 'screenshots', name))
  // The unmodified official helper validates image contents and the dossier limits.
  writeFileSync(join(config.output, 'dossier.json'), buildDossier(config.output, { text_max_bytes: 65536 }))
}
console.log(JSON.stringify({ rows: board.rows.length, watchlist: board.watchlist_size, snapshot_sha256: digest,
  output: config.output, mode: config.preview ? 'preview' : 'dossier' }))
