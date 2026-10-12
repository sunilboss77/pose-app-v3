import { spawn, spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, renameSync, rmdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const api = join(root, 'app', 'api')
const stash = join(root, '.mobile-stash')
const stashedApi = join(stash, 'api')
const env = { ...process.env, BUILD_TARGET: 'mobile', NEXT_PUBLIC_BUILD_TARGET: 'mobile' }
let child
let interrupted
let killTimer
let ownsStash = false
let movedApi = false

function exists(path) {
  try {
    lstatSync(path) // Include dangling symlinks when checking for conflicts.
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function checkInterrupted() {
  if (interrupted) throw new Error(`Mobile build interrupted by ${interrupted}.`)
}

function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

function interrupt(signal) {
  interrupted ??= signal
  if (!child?.pid) return
  const pid = child.pid
  try {
    if (process.platform === 'win32') {
      // Stop the entire Next worker tree, then await the child's close event.
      const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      if (result.error || result.status !== 0) {
        console.error('Could not terminate the build tree; waiting for the build to stop before restoring API routes.')
      }
    } else {
      signalGroup(pid, signal)
      if (!killTimer) {
        killTimer = setTimeout(() => {
          try {
            signalGroup(pid, 'SIGKILL')
          } catch (error) {
            console.error(`Could not stop build workers: ${error.message}`)
          }
        }, 5000)
      }
    }
  } catch (error) {
    console.error(`Could not stop build: ${error.message}; waiting before restoring API routes.`)
  }
}

function runNode(script, args = []) {
  checkInterrupted()
  return new Promise((resolve, reject) => {
    let spawnError
    const running = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    })
    child = running
    running.once('error', (error) => { spawnError = error })
    running.once('close', (code, signal) => {
      // A terminated Next parent may leave workers in its process group.
      if (interrupted && process.platform !== 'win32' && running.pid) {
        try {
          signalGroup(running.pid, 'SIGKILL')
        } catch (error) {
          spawnError ??= error
        }
      }
      clearTimeout(killTimer)
      killTimer = undefined
      child = undefined
      if (spawnError) reject(spawnError)
      else if (interrupted) reject(new Error(`Mobile build interrupted by ${interrupted}.`))
      else if (code !== 0) {
        const error = new Error(`${script} failed (${signal || `exit ${code}`}).`)
        error.exitCode = code || 1
        reject(error)
      } else resolve()
    })
  })
}

function restoreApi() {
  if (!ownsStash) return
  if (movedApi) {
    if (exists(api)) {
      throw new Error('Cannot restore API routes: app/api already exists. Original routes are safe in .mobile-stash/api; reconcile manually before another build.')
    }
    renameSync(stashedApi, api)
    movedApi = false
  }
  // Only remove our empty lock directory; never delete any stashed contents.
  rmdirSync(stash)
  ownsStash = false
}

async function main() {
  if (!process.env.NEXT_PUBLIC_API_BASE_URL?.trim()) {
    throw new Error('Set NEXT_PUBLIC_API_BASE_URL to the deployed API origin before building mobile.')
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('Mobile builds require Node.js 22 or newer.')
  }
  const require = createRequire(join(root, 'package.json'))
  const nextCli = require.resolve('next/dist/bin/next')
  const onSigint = () => interrupt('SIGINT')
  const onSigterm = () => interrupt('SIGTERM')
  process.on('SIGINT', onSigint)
  process.on('SIGTERM', onSigterm)
  try {
    // Atomic directory creation locks concurrent invocations. Never adopt a
    // stale stash: its owner or contents must be checked manually first.
    try {
      mkdirSync(stash)
      ownsStash = true
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error('.mobile-stash already exists: another build may be running or a prior build was interrupted. Inspect it and restore any API routes manually; nothing was overwritten.')
      }
      throw error
    }
    checkInterrupted()
    if (exists(api)) {
      renameSync(api, stashedApi)
      movedApi = true
    }
    await runNode(nextCli, ['build'])
    checkInterrupted()
    for (const page of ['index.html', 'camera/index.html']) {
      const path = join(root, 'out', page)
      if (!exists(path) || !statSync(path).isFile()) {
        throw new Error(`Mobile export is missing out/${page}.`)
      }
    }
    for (const hook of ['prepare-mediapipe.mjs', 'optimize-assets.mjs']) {
      const script = join(root, 'scripts', hook)
      if (exists(script)) await runNode(script)
    }
    checkInterrupted()
  } finally {
    // runNode settles only after close, including signals and spawn failures.
    // Keep signal handlers installed throughout restoration.
    try {
      restoreApi()
    } finally {
      process.off('SIGINT', onSigint)
      process.off('SIGTERM', onSigterm)
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : error.exitCode || 1
})
