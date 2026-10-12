import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packageVersion = '1.0.1'
const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const modelBytes = 249537
const modelSha256 = '191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b'
const wasmFileNames = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_module_internal.js',
  'vision_wasm_module_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]

const require = createRequire(import.meta.url)

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function isRegularFile(file) {
  try {
    return lstatSync(file).isFile()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function removeTemp(file) {
  try {
    rmSync(file, { force: true })
  } catch (error) {
    throw new Error(`Could not remove temporary file ${file}: ${error.message}`)
  }
}

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

  // POSIX rename replaces atomically. Windows does not replace an existing
  // file, so use a same-directory backup and restore it if replacement fails.
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

function destinationIsValid(file, bytes, expectedSha256) {
  if (!isRegularFile(file)) return false
  const contents = readFileSync(file)
  return contents.length === bytes && sha256(contents) === expectedSha256
}

function ensureCopied(source, destination, label) {
  if (!isRegularFile(source)) {
    throw new Error(`MediaPipe ${label} source is missing or not a file: ${source}`)
  }

  const sourceBytes = readFileSync(source)
  const expectedBytes = sourceBytes.length
  const expectedSha256 = sha256(sourceBytes)
  if (destinationIsValid(destination, expectedBytes, expectedSha256)) {
    console.log(`[prepare-mediapipe] skipped valid ${label} (${expectedBytes} bytes)`)
    return { bytes: expectedBytes, sha256: expectedSha256, skipped: true }
  }
  if (existsSync(destination) && !isRegularFile(destination)) {
    throw new Error(`MediaPipe ${label} destination is not a regular file: ${destination}`)
  }

  mkdirSync(dirname(destination), { recursive: true })
  const temp = `${destination}.${process.pid}.${randomUUID()}.tmp`
  try {
    copyFileSync(source, temp)
    const copied = readFileSync(temp)
    if (copied.length !== expectedBytes || sha256(copied) !== expectedSha256) {
      throw new Error(`checksum mismatch while copying ${label}`)
    }
    syncFile(temp)
    atomicReplace(temp, destination)
    console.log(`[prepare-mediapipe] wrote ${label} (${expectedBytes} bytes)`)
    return { bytes: expectedBytes, sha256: expectedSha256, skipped: false }
  } catch (error) {
    if (existsSync(temp)) removeTemp(temp)
    throw new Error(`Could not prepare ${label}: ${error.message}`)
  }
}

function findInstalledPackage() {
  let entry
  try {
    entry = require.resolve('@mediapipe/tasks-vision')
  } catch (error) {
    throw new Error(`Could not resolve @mediapipe/tasks-vision@${packageVersion}: ${error.message}`)
  }
  const packageDirectory = dirname(entry)
  const packageJsonFile = join(packageDirectory, 'package.json')
  let packageJson
  try {
    packageJson = JSON.parse(readFileSync(packageJsonFile, 'utf8'))
  } catch (error) {
    throw new Error(`Could not read the installed MediaPipe package metadata: ${error.message}`)
  }
  if (packageJson.version !== packageVersion) {
    throw new Error(
      `Expected @mediapipe/tasks-vision@${packageVersion}, found ${packageJson.version || 'an unknown version'}.`,
    )
  }
  return packageDirectory
}

function prepareWasm() {
  const packageDirectory = findInstalledPackage()
  const sourceDirectory = join(packageDirectory, 'wasm')
  const destinationDirectory = join(root, 'public', 'mediapipe', 'wasm')
  const results = []
  for (const fileName of wasmFileNames) {
    const result = ensureCopied(join(sourceDirectory, fileName), join(destinationDirectory, fileName), `WASM ${fileName}`)
    results.push({ fileName, ...result })
  }
  return results
}

async function downloadModel(destination) {
  if (destinationIsValid(destination, modelBytes, modelSha256)) {
    console.log(`[prepare-mediapipe] skipped valid selfie segmenter (${modelBytes} bytes)`)
    return { bytes: modelBytes, sha256: modelSha256, skipped: true }
  }
  if (existsSync(destination) && !isRegularFile(destination)) {
    throw new Error(`Selfie segmenter destination is not a regular file: ${destination}`)
  }

  mkdirSync(dirname(destination), { recursive: true })
  const temp = `${destination}.${process.pid}.${randomUUID()}.tmp`
  try {
    let response
    try {
      response = await fetch(modelUrl)
    } catch (error) {
      throw new Error(`request failed: ${error.message}`)
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }

    let body
    try {
      body = Buffer.from(await response.arrayBuffer())
    } catch (error) {
      throw new Error(`response body could not be read: ${error.message}`)
    }
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number.isSafeInteger(Number(contentLength)) && body.length !== Number(contentLength)) {
      throw new Error(`partial download: received ${body.length} bytes, expected HTTP content-length ${contentLength}`)
    }
    const actualSha256 = sha256(body)
    if (body.length !== modelBytes || actualSha256 !== modelSha256) {
      throw new Error(
        `checksum mismatch: received ${body.length} bytes/${actualSha256}, expected ${modelBytes} bytes/${modelSha256}`,
      )
    }

    writeFileSync(temp, body, { flag: 'wx' })
    syncFile(temp)
    atomicReplace(temp, destination)
    console.log(`[prepare-mediapipe] downloaded selfie segmenter (${modelBytes} bytes, sha256 ${modelSha256})`)
    return { bytes: modelBytes, sha256: modelSha256, skipped: false }
  } catch (error) {
    if (existsSync(temp)) removeTemp(temp)
    throw new Error(`Could not prepare selfie segmenter from ${modelUrl}: ${error.message}`)
  }
}

async function main() {
  const wasm = prepareWasm()
  const model = await downloadModel(join(root, 'public', 'mediapipe', 'selfie_segmenter.tflite'))
  const copied = wasm.filter((file) => !file.skipped).length + (model.skipped ? 0 : 1)
  console.log(`[prepare-mediapipe] ready: ${copied} file(s) copied or downloaded; ${wasm.length + 1 - copied} valid file(s) reused`)
}

main().catch((error) => {
  console.error(`[prepare-mediapipe] ${error.message}`)
  process.exitCode = 1
})
