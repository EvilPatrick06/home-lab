// Mock for pdfjs-dist used in test environment
export const GlobalWorkerOptions = {
  workerSrc: ''
}

export function getDocument() {
  return {
    promise: Promise.resolve({
      numPages: 0,
      getPage: () =>
        Promise.resolve({
          getViewport: () => ({ width: 100, height: 100 }),
          render: () => ({ promise: Promise.resolve() }),
          getTextContent: () => Promise.resolve({ items: [] })
        })
    })
  }
}
