import { execSync } from 'child_process'
import { readdirSync, existsSync } from 'fs'

// Check /code directory
try {
  const contents = readdirSync('/code').join(', ')
  console.log('[v0] /code contents:', contents.substring(0, 500))
} catch (e) {
  console.log('[v0] /code error:', e.message)
}

// Check for package.json in /code
if (existsSync('/code/package.json')) {
  console.log('[v0] package.json found in /code')
  try {
    const pkg = JSON.parse(require('fs').readFileSync('/code/package.json', 'utf8'))
    console.log('[v0] scripts:', JSON.stringify(pkg.scripts, null, 2))
  } catch (e) {}
}

// find package.json anywhere
try {
  const found = execSync('find /code -name "package.json" -maxdepth 3 -not -path "*/node_modules/*" 2>&1', { encoding: 'utf8' })
  console.log('[v0] package.json files:', found)
} catch (e) {
  console.log('[v0] find error:', e.message)
}

// try pnpm in common paths
const paths = [
  '/usr/local/bin/pnpm',
  '/usr/bin/pnpm', 
  '/root/.local/share/pnpm/pnpm',
  '/home/user/.local/share/pnpm/pnpm',
]
for (const p of paths) {
  if (existsSync(p)) console.log('[v0] pnpm at:', p)
}

try {
  const path = execSync('echo $PATH', { encoding: 'utf8' })
  console.log('[v0] PATH:', path)
} catch (e) {}
