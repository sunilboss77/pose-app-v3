import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const assetDirectories = ['poses', 'pose-refs', 'references', 'inspo']

let sharp

function syncFile(file) {
  // Windows may reject fsync on a read-only descriptor; temp files are ours.
  const fd = openSync(file, 'r+')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

function atomicReplace(temp, destination) {
  if (!existsSync(destination)) {
    renameSync(temp, destination)
    return
  }

  // POSIX rename replaces atomically. Windows needs a same-directory backup;
  // the original is retained until the new file has been installed.
  try {
    renameSync(temp, destination)
    return
  } catch (error) {
    if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error
  }

  const backup = `${destination}.${process.pid}.${randomUUID()}.backup`
  let backupExists = false
  try {
    renameSync(destination, backup)
    backupExists = true
    renameSync(temp, destination)
    backupExists = false
    rmSync(backup, { force: true })
  } catch (error) {
    if (backupExists) {
      try {
        if (!existsSync(destination)) renameSync(backup, destination)
      } catch (restoreError) {
        throw new Error(
          `Could not replace ${destination} (${error.message}); restoring the original also failed: ${restoreError.message}`,
        )
      }
    }
    throw error
  } finally {
    if (backupExists) rmSync(backup, { force: true })
  }
}

function collectPngs(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectPngs(file))
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.png') {
      files.push(file)
    }
  }
  return files
}

async function optimizePng(file) {
  // PNG encoding is lossless and sharp preserves the source channels, including alpha.
  const source = await sharp(file).png({
    adaptiveFiltering: true,
    compressionLevel: 9,
    effort: 7,
    palette: false,
  }).toBuffer()
  const originalBytes = statSync(file).size
  if (source.length >= originalBytes) return { originalBytes, optimizedBytes: originalBytes, replaced: false }

  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, source, { flag: 'wx' })
    syncFile(temp)
    atomicReplace(temp, file)
    return { originalBytes, optimizedBytes: source.length, replaced: true }
  } catch (error) {
    if (existsSync(temp)) rmSync(temp, { force: true })
    throw new Error(`Could not replace ${file}: ${error.message}`)
  }
}

async function main() {
  try {
    sharp = (await import('sharp')).default
  } catch (error) {
    throw new Error(`Could not load the installed sharp package. Run the existing project install first: ${error.message}`)
  }

  const files = []
  for (const directoryName of assetDirectories) {
    const directory = join(root, 'public', directoryName)
    if (!existsSync(directory)) {
      throw new Error(`Asset directory is missing: ${directory}`)
    }
    if (!lstatSync(directory).isDirectory()) {
      throw new Error(`Asset path is not a directory: ${directory}`)
    }
    files.push(...collectPngs(directory))
  }

  let replaced = 0
  let beforeBytes = 0
  let afterBytes = 0
  for (const file of files) {
    const result = await optimizePng(file)
    beforeBytes += result.originalBytes
    afterBytes += result.optimizedBytes
    if (result.replaced) replaced += 1
  }
  const skipped = files.length - replaced
  console.log(
    `[optimize-assets] processed ${files.length} PNG(s): replaced ${replaced}, skipped ${skipped}; ${beforeBytes} bytes before, ${afterBytes} bytes after, saved ${beforeBytes - afterBytes} bytes`,
  )
}

main().catch((error) => {
  console.error(`[optimize-assets] ${error.message}`)
  process.exitCode = 1
})
