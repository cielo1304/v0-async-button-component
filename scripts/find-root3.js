const { execSync } = require('child_process')
const { readdirSync, existsSync, readFileSync } = require('fs')

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
    const pkg = JSON.parse(readFileSync('/code/package.json', 'utf8'))
    console.log('[v0] scripts:', JSON.stringify(pkg.scripts, null, 2))
  } catch (e) { console.log(e.message) }
}

// find package.json anywhere
try {
  const found = execSync('find /code -name "package.json" -maxdepth 3 -not -path "*/node_modules/*" 2>&1', { encoding: 'utf8' })
  console.log('[v0] package.json files:', found)
} catch (e) {
  console.log('[v0] find error:', e.message)
}

try {
  const path = execSync('echo $PATH', { encoding: 'utf8' })
  console.log('[v0] PATH:', path.trim())
} catch (e) {}

// look for pnpm
try {
  const loc = execSync('which pnpm || find /usr -name pnpm 2>/dev/null | head -3 || find /root -name pnpm 2>/dev/null | head -3', { encoding: 'utf8' })
  console.log('[v0] pnpm location:', loc)
} catch (e) {
  console.log('[v0] pnpm search error:', e.message)
}
