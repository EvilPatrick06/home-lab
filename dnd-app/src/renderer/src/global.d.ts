import type { JSX as ReactJSX } from 'react'

declare global {
  const __APP_VERSION__: string

  namespace JSX {
    interface Element extends ReactJSX.Element {}
    interface IntrinsicElements extends ReactJSX.IntrinsicElements {}
    interface ElementChildrenAttribute extends ReactJSX.ElementChildrenAttribute {}
  }
}
