// Pure ToC helpers extracted from PdfViewer.tsx (behavior-preserving).
import type { TocEntry } from './types'

// Sort sibling entries by page number while preserving the parent/child tree
// structure implied by `level`. Fixes out-of-order extracted outlines.
export function sortByPage(flat: TocEntry[]): TocEntry[] {
  type Node = { entry: TocEntry; children: Node[] }
  const roots: Node[] = []
  const stack: Node[] = []

  for (const entry of flat) {
    const node: Node = { entry, children: [] }
    while (stack.length > 0 && stack[stack.length - 1].entry.level >= entry.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1].children.push(node)
    }
    stack.push(node)
  }

  function sortChildren(nodes: Node[]): void {
    nodes.sort((a, b) => a.entry.page - b.entry.page)
    for (const n of nodes) sortChildren(n.children)
  }
  sortChildren(roots)

  const result: TocEntry[] = []
  function flatten(nodes: Node[]): void {
    for (const n of nodes) {
      result.push(n.entry)
      flatten(n.children)
    }
  }
  flatten(roots)
  return result
}
