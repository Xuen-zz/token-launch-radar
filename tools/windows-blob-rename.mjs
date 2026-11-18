// Compatibility for the kit's POSIX chmod(0444)-then-rename blob cache on Windows.
// No scorer, transcript, repository or submitted file is changed by this preload.
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

if (process.platform === 'win32') {
  const rename = fs.promises.rename.bind(fs.promises)
  fs.promises.rename = async (from, to) => {
    try { return await rename(from, to) }
    catch (error) {
      const source = resolve(String(from))
      const target = resolve(String(to))
      const cachePath = sep + 'blobs' + sep
      if (error.code !== 'EPERM' || !source.startsWith(resolve(tmpdir()) + sep) ||
          !source.includes(cachePath + 'tmp' + sep) || !source.endsWith('.part') ||
          !target.startsWith(source.slice(0, source.indexOf(cachePath)) + cachePath)) throw error
      // Concurrent identical puts can race after the CLI's existing-blob check.
      // Windows refuses replacing their sealed read-only target. Keep the same bytes.
      if (fs.existsSync(target)) {
        const [staged, stored] = await Promise.all([fs.promises.readFile(source), fs.promises.readFile(target)])
        if (!staged.equals(stored)) throw error
        await fs.promises.chmod(source, 0o600)
        await fs.promises.unlink(source)
        return
      }
      const mode = (await fs.promises.stat(source)).mode
      if (mode & 0o200) throw error
      await fs.promises.chmod(source, 0o600)
      try {
        await rename(source, target)
        await fs.promises.chmod(target, mode)
      } catch (retryError) {
        if (fs.existsSync(source)) await fs.promises.chmod(source, mode)
        throw retryError
      }
    }
  }
  syncBuiltinESMExports()
}
