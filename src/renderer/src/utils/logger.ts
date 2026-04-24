const isDev = import.meta.env.DEV

export const logger = {
  debug: (...args: unknown[]): void => {
    if (isDev) console.debug('[DEBUG]', ...args)
  },
  info: (...args: unknown[]): void => {
    if (isDev) console.info('[INFO]', ...args)
  },
  warn: (...args: unknown[]): void => {
    if (isDev) console.warn('[WARN]', ...args)
  },
  error: (...args: unknown[]): void => {
    if (isDev) console.error('[ERROR]', ...args)
  },
  log: (...args: unknown[]): void => {
    if (isDev) console.log(...args)
  }
}
