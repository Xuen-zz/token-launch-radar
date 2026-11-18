import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const check = JSON.parse(readFileSync(join(root, 'review', 'preflight-report.json'), 'utf8'))
const output = JSON.parse(readFileSync(join(root, 'review', 'output-check.json'), 'utf8'))
const bundle = JSON.parse(readFileSync(join(root, 'review', 'bundle-report.json'), 'utf8'))
if (!check.ok || check.failed.length || !output.ok) throw Error('Passing reports are required before packaging.')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const transcriptBytes = readFileSync(join(root, 'review', 'transcripts.tar.gz'))
if (hash(transcriptBytes) !== bundle.bundle_sha256) throw Error('Transcript bundle differs from its report.')
const stamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)
const staging = join(root, 'artifacts', 'radar-materials-' + stamp)
mkdirSync(join(staging, 'source'), { recursive: true })
for (const file of ['main.ts', 'package.json', '.gitignore', 'README.md', 'LICENSE', 'PROVENANCE.md']) cpSync(join(root, file), join(staging, 'source', file))
for (const directory of ['.makefun', 'reference', 'vendor', 'dashboard', 'screenshots', 'tools']) cpSync(join(root, directory), join(staging, 'source', directory), { recursive: true })
mkdirSync(join(staging, 'source', 'review'))
for (const file of ['RESULTS.md', 'SUBMIT.md', 'POLICY.md']) cpSync(join(root, 'review', file), join(staging, 'source', 'review', file))
cpSync(join(root, 'out'), join(staging, 'rendered'), { recursive: true })
mkdirSync(join(staging, 'checks'))
for (const file of ['preflight-report.json', 'bundle-report.json', 'output-check.json', 'browser-check.json', 'acceptance.txt']) cpSync(join(root, 'review', file), join(staging, 'checks', file))
cpSync(join(root, 'review', 'transcripts.tar.gz'), join(staging, 'transcripts.tar.gz'))
writeFileSync(join(staging, 'CONTENTS.md'), '# Radar submission review materials\n\n' +
  '- source/: actual entry sources, attributed reviewed engine, new screenshots and review notes.\n' +
  '- rendered/dashboard/index.html: open locally with its sibling data.js retained.\n' +
  '- rendered/: complete deterministic board and official dossier.\n' +
  '- checks/: acceptance, real-browser, output and supplied-kit worktree preflight reports.\n' +
  '- transcripts.tar.gz: official redacted bundle of the genuine native Radar session. Private review material; do not publish to GitHub.\n\n' +
  'This archive is review material for the GitHub entry route. It is not a beacon-anchored source-bundle submission. ' +
  'No Git commit, remote repository, account signature or submission was made. See source/review/SUBMIT.md.\n')
function entries(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry =>
    entry.isDirectory() ? entries(join(directory, entry.name)) : [join(directory, entry.name)])
}
const sums = entries(staging).map(file => hash(readFileSync(file)) + '  ' + relative(staging, file).replaceAll('\\', '/'))
writeFileSync(join(staging, 'SHA256SUMS.txt'), sums.join('\n') + '\n')
const archive = staging + '.zip'
const zip = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
  '$packageRoot=$env:RADAR_PACKAGE_SOURCE; ' +
  '$zipFile=[System.IO.Compression.ZipFile]::Open($env:RADAR_PACKAGE_ARCHIVE,[System.IO.Compression.ZipArchiveMode]::Create); ' +
  'try { foreach($file in Get-ChildItem -LiteralPath $packageRoot -Recurse -File -Force) { ' +
  '$entryName=$file.FullName.Substring($packageRoot.Length+1).Replace([char]92,[char]47); ' +
  '[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipFile,$file.FullName,$entryName,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null ' +
  '} } finally { $zipFile.Dispose() }'],
  { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, RADAR_PACKAGE_SOURCE: staging, RADAR_PACKAGE_ARCHIVE: archive } })
if (zip.error) throw zip.error
if (zip.status !== 0) throw Error(zip.stderr)
const bytes = readFileSync(archive)
const summary = { archive, bytes: bytes.length, sha256: hash(bytes), expanded: staging,
  transcript_session: bundle.manifest.sessions[0].session_id, preflight: 'worktree pass; commit and remote checks pending' }
writeFileSync(join(root, 'review', 'delivery.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary, null, 2))
