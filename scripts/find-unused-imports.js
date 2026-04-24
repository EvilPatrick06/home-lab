const { execSync } = require('child_process');
let text;
try {
  text = execSync('npx biome check src/ --max-diagnostics=500', { encoding: 'utf8', cwd: process.cwd() });
} catch (e) {
  text = (e.stdout || '') + (e.stderr || '');
}
const lines = text.split('\n');
const unused = lines.filter(l => l.includes('noUnusedImports') || l.includes('noUnusedVariables'));
const fileRe = /^(src[\\/][^\s:]+)/;
const files = new Set();
for (const line of unused) {
  const m = line.match(fileRe);
  if (m) files.add(m[1].replace(/\\/g, '/'));
}
for (const f of files) console.log(f);
console.log('---Total:', files.size);
