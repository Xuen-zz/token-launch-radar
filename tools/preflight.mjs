import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const [kitArg, sessionArg] = process.argv.slice(2)
if (!kitArg || !sessionArg) throw Error('Usage: node tools/preflight.mjs <official kit directory> <native Radar session.jsonl>')
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const kit = resolve(kitArg)
const session = resolve(sessionArg)
const cli = join(kit, 'cli', 'makefun.mjs')
const events = readFileSync(session, 'utf8').trim().split('\n').map(line => JSON.parse(line))
const metadata = events.find(event => event.type === 'session_meta')?.payload
if (!metadata || resolve(metadata.cwd).toLowerCase() !== root.toLowerCase()) throw Error('The native log must belong to this Radar workspace.')
if (!events.some(event => event.type === 'response_item' && event.payload.role === 'user' &&
  event.payload.content?.some(part => /START-HERE\.md|Radar|交接文件/.test(part.text ?? '')))) throw Error('Radar user instructions were not found in this session.')
const context = events.filter(event => event.type === 'turn_context').at(-1)?.payload
mkdirSync(join(root, 'review'), { recursive: true })
function run(name, arguments_) {
  const result = spawnSync(process.execPath, arguments_, { cwd: root, windowsHide: true, timeout: 120000, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  if (result.error) throw result.error
  writeFileSync(join(root, 'review', name + '.stderr.txt'), result.stderr)
  writeFileSync(join(root, 'review', name + '.json'), result.stdout)
  if (!result.stdout.trim().startsWith('{')) throw Error(name + ' did not produce JSON: ' + result.stderr)
  const report = JSON.parse(result.stdout)
  if (result.status !== 0) throw Error(name + ' failed; inspect review/' + name + '.json and .stderr.txt')
  return report
}
const bundle = run('bundle-report', [cli, 'bundle', '--repo', root, '--out', join(root, 'review', 'transcripts.tar.gz'),
  '--session', session, '--no-discover', '--no-family', '--harness', 'codex', '--harness-version', metadata.cli_version,
  '--provider', metadata.model_provider, ...(context?.model ? ['--model', context.model] : []),
  '--effort', context?.effort ?? context?.reasoning_effort ?? 'default',
  '--notes', 'MIT reference engine explicitly attributed; new entrypoint, dashboard and tools authored in this Radar session. Local worktree preflight; no submission or account signature.', '--json'])
const check = run('preflight-report', [
  ...(process.platform === 'win32' ? ['--import', pathToFileURL(join(root, 'tools', 'windows-blob-rename.mjs')).href] : []),
  cli, 'check', '--kit', kit, '--repo', root, '--worktree', '--transcripts', join(root, 'review', 'transcripts.tar.gz'), '--json',
])
const sessions = bundle.manifest.sessions
if (sessions.length !== 1 || sessions[0].session_id !== metadata.id) throw Error('Unexpected session selection.')
if (check.failed.length || !check.ok) throw Error('Preflight is not passing.')
const output = run('output-check', [join(root, 'tools', 'verify-build.mjs'), join(kit, 'input', 'snapshot.json')])
console.log(JSON.stringify({ ok: true, session_id: metadata.id, sessions: sessions.length, bundle_bytes: bundle.bundle_bytes,
  transcript_gate: check.checks.filter(item => item.phase === 'transcripts').map(({ check, status, reason }) => ({ check, status, reason })),
  output: { rows: output.rows, watchlist: output.watchlist, deterministic_files: output.deterministic_files, dossier_bytes: output.dossier_bytes },
  scope: 'Worktree only; create and push a new GitHub repository, then recheck the actual commit before signing.' }, null, 2))
