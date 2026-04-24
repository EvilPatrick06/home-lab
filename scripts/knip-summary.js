const r = JSON.parse(require('fs').readFileSync('Tests/knip-report.json', 'utf8'))
console.log('Unused files:', r.files?.length || 0)
let totalExports = 0, totalTypes = 0
for (const issue of r.issues || []) {
  totalExports += issue.exports?.length || 0
  totalTypes += issue.types?.length || 0
  if (issue.exports?.length > 0) {
    for (const e of issue.exports) {
      console.log('  Export:', issue.file + ':' + e.line, e.name)
    }
  }
  if (issue.types?.length > 0) {
    for (const t of issue.types) {
      console.log('  Type:', issue.file + ':' + t.line, t.name)
    }
  }
}
console.log('Total unused exports:', totalExports)
console.log('Total unused types:', totalTypes)
console.log('Grand total:', (r.files?.length || 0) + totalExports + totalTypes)
