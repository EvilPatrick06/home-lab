/**
 * Shared D&D Beyond modifier types used across the DDB import mappers.
 */

export interface DdbModifier {
  type?: string
  subType?: string
  value?: number
  friendlySubtypeName?: string
  friendlyTypeName?: string
}

export type DdbModifiers = Record<string, DdbModifier[]>
