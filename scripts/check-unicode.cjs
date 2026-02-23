#!/usr/bin/env node

/**
 * check-unicode.cjs
 * Trojan Source guard: scans for dangerous Unicode characters (Bidi controls, invisibles).
 * 
 * Usage:
 *   node scripts/check-unicode.cjs           # check only
 *   node scripts/check-unicode.cjs --fix     # remove found characters
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// File extensions to scan
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.md', '.css', '.scss', '.sql', '.yml', '.yaml'];

// Dangerous Unicode characters
const BIDI_CONTROLS = [
  0x202A, 0x202B, 0x202C, 0x202D, 0x202E, // LRE, RLE, PDF, LRO, RLO
  0x2066, 0x2067, 0x2068, 0x2069,         // LRI, RLI, FSI, PDI
  0x200E, 0x200F,                          // LRM, RLM
  0x061C                                   // ALM
];

const INVISIBLES = [
  0x200B, // ZERO WIDTH SPACE
  0x200C, // ZERO WIDTH NON-JOINER
  0x200D, // ZERO WIDTH JOINER
  0xFEFF, // ZERO WIDTH NO-BREAK SPACE (BOM)
  0x00AD, // SOFT HYPHEN
  0x2028, // LINE SEPARATOR
  0x2029  // PARAGRAPH SEPARATOR
];

const DANGEROUS_CHARS = new Set([...BIDI_CONTROLS, ...INVISIBLES]);

const CHAR_NAMES = {
  0x202A: 'LEFT-TO-RIGHT EMBEDDING',
  0x202B: 'RIGHT-TO-LEFT EMBEDDING',
  0x202C: 'POP DIRECTIONAL FORMATTING',
  0x202D: 'LEFT-TO-RIGHT OVERRIDE',
  0x202E: 'RIGHT-TO-LEFT OVERRIDE',
  0x2066: 'LEFT-TO-RIGHT ISOLATE',
  0x2067: 'RIGHT-TO-LEFT ISOLATE',
  0x2068: 'FIRST STRONG ISOLATE',
  0x2069: 'POP DIRECTIONAL ISOLATE',
  0x200E: 'LEFT-TO-RIGHT MARK',
  0x200F: 'RIGHT-TO-LEFT MARK',
  0x061C: 'ARABIC LETTER MARK',
  0x200B: 'ZERO WIDTH SPACE',
  0x200C: 'ZERO WIDTH NON-JOINER',
  0x200D: 'ZERO WIDTH JOINER',
  0xFEFF: 'ZERO WIDTH NO-BREAK SPACE',
  0x00AD: 'SOFT HYPHEN',
  0x2028: 'LINE SEPARATOR',
  0x2029: 'PARAGRAPH SEPARATOR'
};

// Get file list using git ls-files or fallback to walk
function getFiles() {
  try {
    const output = execSync('git ls-files -z', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.split('\0').filter(f => f && EXTENSIONS.some(ext => f.endsWith(ext)));
  } catch {
    // Fallback: manual walk
    return walkDir(process.cwd());
  }
}

function walkDir(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      walkDir(fullPath, files);
    } else if (EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
      files.push(path.relative(process.cwd(), fullPath));
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (DANGEROUS_CHARS.has(code)) {
      const start = Math.max(0, i - 10);
      const end = Math.min(content.length, i + 10);
      const context = content.slice(start, end).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      findings.push({
        file: filePath,
        index: i,
        code,
        hex: `U+${code.toString(16).toUpperCase().padStart(4, '0')}`,
        name: CHAR_NAMES[code] || 'UNKNOWN',
        context
      });
    }
  }

  return findings;
}

function fixFile(filePath, findings) {
  let content = fs.readFileSync(filePath, 'utf8');
  const codes = new Set(findings.map(f => f.code));
  content = Array.from(content).filter(c => !codes.has(c.charCodeAt(0))).join('');
  fs.writeFileSync(filePath, content, 'utf8');
}

function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');

  console.log('[unicode-check] Scanning for dangerous Unicode characters...\n');

  const files = getFiles();
  console.log(`[unicode-check] Scanning ${files.length} files...\n`);

  const allFindings = [];

  for (const file of files) {
    const findings = scanFile(file);
    if (findings.length > 0) {
      allFindings.push({ file, findings });
    }
  }

  if (allFindings.length === 0) {
    console.log('✅ No dangerous Unicode characters found.\n');
    process.exit(0);
  }

  // Report findings
  console.error('❌ Found dangerous Unicode characters:\n');
  for (const { file, findings } of allFindings) {
    console.error(`File: ${file}`);
    for (const f of findings) {
      console.error(`  Index ${f.index}: ${f.hex} (${f.name})`);
      console.error(`  Context: "${f.context}"\n`);
    }
  }

  if (fixMode) {
    console.log('[unicode-check] Applying fixes...\n');
    for (const { file, findings } of allFindings) {
      fixFile(file, findings);
      console.log(`✅ Fixed: ${file}`);
    }
    console.log('\n✅ All dangerous characters removed.\n');
    process.exit(0);
  } else {
    console.error('\n❌ Run with --fix to remove these characters.\n');
    process.exit(1);
  }
}

main();
