import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

async function run() {
  const storageDir = join(__dirname, '..', 'src', 'main', 'storage')
  const files = await readdir(storageDir)

  for (const file of files) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts') || file === 'atomic-write.ts') {
      continue
    }

    const filePath = join(storageDir, file)
    let content = await readFile(filePath, 'utf-8')

    if (content.includes(' writeFile(') || content.includes('writeFile(')) {
      // 1. Add import for atomicWriteFile
      if (!content.includes('atomicWriteFile')) {
        const importMatch = content.match(/import .* from ['"]node:fs\/promises['"]/)
        if (importMatch && importMatch.index !== undefined) {
          // Insert after the node:fs/promises import
          const insertPos = importMatch.index + importMatch[0].length + 1
          content = content.slice(0, insertPos) + `import { atomicWriteFile } from './atomic-write'\n` + content.slice(insertPos)
        } else {
          // Or just at the top
          content = `import { atomicWriteFile } from './atomic-write'\n` + content
        }
      }

      // 2. Replace the actual call. Careful not to replace within strings or already replaced
      // We expect: return writeFile( or await writeFile(
      content = content.replace(/(await |return\s+)writeFile\(/g, '$1atomicWriteFile(')

      // 3. Remove writeFile from fs imports if it's there
      // This is a bit tricky, but usually it looks like { ..., writeFile } or { writeFile }
      // This simple regex handles standard cases
      content = content.replace(/, writeFile/g, '')
      content = content.replace(/writeFile, /g, '')
      content = content.replace(/\{ writeFile \}/g, '{}')

      await writeFile(filePath, content, 'utf-8')
      console.log(`Updated ${file}`)
    }
  }
}

run().catch(console.error)
