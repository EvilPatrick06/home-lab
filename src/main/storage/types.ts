export type StorageResult<T> = {
  success: boolean
  data?: T
  error?: string
}
