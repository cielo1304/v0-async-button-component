import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'

// Find project root - look for package.json with next dependency
const candidates = ['/app', '/workspace', '/project', '/home', '/', '/var/task']
let root = null
for (const c of candidates) {
  if (existsSync(c + '/package.json')) {
    root = c
    console.log('[v0] Found package.json at', root)
    try {
      const ls = readdirSync(root).join(', ')
      console.log('[v0] Contents:', ls.substring(0, 300))
    } catch (_) {}
    break
  }
}

if (!root) {
  console.log('[v0] No package.json found in candidates')
  // try listing /
  try { console.log('[v0] / contents:', readdirSync('/').join(', ')) } catch(e) { console.log(e.message) }
  process.exit(1)
}

// Try different package managers
const pms = ['pnpm', 'npm', 'yarn', 'npx next']
for (const pm of pms) {
  try {
    const which = execSync(`which ${pm.split(' ')[0]} 2>&1`, { encoding: 'utf8' })
    console.log(`[v0] ${pm.split(' ')[0]} found at: ${which.trim()}`)
  } catch (_) {
    console.log(`[v0] ${pm.split(' ')[0]} not found`)
  }
}

// Try node_modules/.bin
if (existsSync(root + '/node_modules/.bin/next')) {
  console.log('[v0] next binary exists in node_modules/.bin')
}

try {
  const out = execSync(`ls ${root}/node_modules/.bin/ 2>&1 | head -20`, { encoding: 'utf8' })
  console.log('[v0] node_modules/.bin sample:', out)
} catch (e) {
  console.log('[v0] no node_modules/.bin:', e.message)
}
