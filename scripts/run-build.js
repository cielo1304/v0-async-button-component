import { execSync } from 'child_process'

try {
  console.log('=== pnpm check:unicode ===')
  const unicodeOut = execSync('cd / && pnpm check:unicode 2>&1', { encoding: 'utf8' })
  console.log(unicodeOut)
} catch (e) {
  console.log(e.stdout || '')
  console.log('check:unicode failed:', e.message)
}

try {
  console.log('=== pnpm build ===')
  const buildOut = execSync('cd / && pnpm build 2>&1', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  console.log(buildOut)
} catch (e) {
  console.log(e.stdout || '')
  console.log('BUILD FAILED:', e.message)
}
