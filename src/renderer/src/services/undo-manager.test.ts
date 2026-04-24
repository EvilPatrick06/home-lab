import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canRedo,
  canUndo,
  clear,
  createFogAction,
  createTokenMoveAction,
  getHistoryLength,
  push,
  redo,
  type UndoableAction,
  undo
} from './undo-manager'

// Reset module state between tests
beforeEach(() => {
  clear()
})

function makeAction(overrides?: Partial<UndoableAction>): UndoableAction {
  return {
    type: 'test',
    description: 'Test action',
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides
  }
}

describe('undo-manager', () => {
  describe('push', () => {
    it('adds an action to the undo stack', () => {
      expect(canUndo()).toBe(false)
      push(makeAction())
      expect(canUndo()).toBe(true)
      expect(getHistoryLength()).toBe(1)
    })

    it('clears the redo stack when a new action is pushed', () => {
      const a1 = makeAction({ description: 'first' })
      const a2 = makeAction({ description: 'second' })
      push(a1)
      undo()
      expect(canRedo()).toBe(true)
      push(a2)
      expect(canRedo()).toBe(false)
    })

    it('limits the undo stack to MAX_HISTORY (20)', () => {
      for (let i = 0; i < 25; i++) {
        push(makeAction({ description: `action-${i}` }))
      }
      expect(getHistoryLength()).toBe(20)
    })
  })

  describe('undo', () => {
    it('calls undo on the most recent action', () => {
      const action = makeAction()
      push(action)
      undo()
      expect(action.undo).toHaveBeenCalledTimes(1)
    })

    it('moves the action to the redo stack', () => {
      push(makeAction())
      expect(canRedo()).toBe(false)
      undo()
      expect(canRedo()).toBe(true)
      expect(canUndo()).toBe(false)
    })

    it('does nothing when undo stack is empty', () => {
      undo() // should not throw
      expect(canRedo()).toBe(false)
    })
  })

  describe('redo', () => {
    it('calls redo on the most recently undone action', () => {
      const action = makeAction()
      push(action)
      undo()
      redo()
      expect(action.redo).toHaveBeenCalledTimes(1)
    })

    it('moves the action back to the undo stack', () => {
      push(makeAction())
      undo()
      redo()
      expect(canUndo()).toBe(true)
      expect(canRedo()).toBe(false)
    })

    it('does nothing when redo stack is empty', () => {
      redo() // should not throw
      expect(canUndo()).toBe(false)
    })
  })

  describe('canUndo / canRedo', () => {
    it('returns false when stacks are empty', () => {
      expect(canUndo()).toBe(false)
      expect(canRedo()).toBe(false)
    })

    it('tracks undo/redo state correctly through multiple operations', () => {
      push(makeAction())
      push(makeAction())
      expect(canUndo()).toBe(true)
      expect(canRedo()).toBe(false)

      undo()
      expect(canUndo()).toBe(true)
      expect(canRedo()).toBe(true)

      undo()
      expect(canUndo()).toBe(false)
      expect(canRedo()).toBe(true)

      redo()
      expect(canUndo()).toBe(true)
      expect(canRedo()).toBe(true)
    })
  })

  describe('clear', () => {
    it('empties both stacks', () => {
      push(makeAction())
      undo()
      push(makeAction())
      clear()
      expect(canUndo()).toBe(false)
      expect(canRedo()).toBe(false)
      expect(getHistoryLength()).toBe(0)
    })
  })

  describe('getHistoryLength', () => {
    it('returns the current undo stack length', () => {
      expect(getHistoryLength()).toBe(0)
      push(makeAction())
      push(makeAction())
      expect(getHistoryLength()).toBe(2)
      undo()
      expect(getHistoryLength()).toBe(1)
    })
  })

  describe('createTokenMoveAction', () => {
    it('creates an action with correct type and description', () => {
      const moveToken = vi.fn()
      const action = createTokenMoveAction('map1', 'tok1', 0, 0, 5, 5, moveToken)

      expect(action.type).toBe('token-move')
      expect(action.description).toContain('tok1')
      expect(action.description).toContain('(0,0)')
      expect(action.description).toContain('(5,5)')
    })

    it('undo calls moveToken back to original position', () => {
      const moveToken = vi.fn()
      const action = createTokenMoveAction('map1', 'tok1', 2, 3, 8, 9, moveToken)

      action.undo()
      expect(moveToken).toHaveBeenCalledWith('map1', 'tok1', 2, 3)
    })

    it('redo calls moveToken to the destination position', () => {
      const moveToken = vi.fn()
      const action = createTokenMoveAction('map1', 'tok1', 2, 3, 8, 9, moveToken)

      action.redo()
      expect(moveToken).toHaveBeenCalledWith('map1', 'tok1', 8, 9)
    })
  })

  describe('createFogAction', () => {
    it('creates a reveal fog action with correct description', () => {
      const revealFog = vi.fn()
      const hideFog = vi.fn()
      const cells = [
        { x: 1, y: 2 },
        { x: 3, y: 4 }
      ]
      const action = createFogAction('map1', cells, true, revealFog, hideFog)

      expect(action.type).toBe('fog-change')
      expect(action.description).toContain('Reveal')
      expect(action.description).toContain('2')
    })

    it('creates a hide fog action with correct description', () => {
      const revealFog = vi.fn()
      const hideFog = vi.fn()
      const cells = [{ x: 1, y: 2 }]
      const action = createFogAction('map1', cells, false, revealFog, hideFog)

      expect(action.description).toContain('Hide')
      expect(action.description).toContain('1')
    })

    it('undo on a reveal action calls hideFog', () => {
      const revealFog = vi.fn()
      const hideFog = vi.fn()
      const cells = [{ x: 0, y: 0 }]
      const action = createFogAction('map1', cells, true, revealFog, hideFog)

      action.undo()
      expect(hideFog).toHaveBeenCalledWith('map1', cells)
      expect(revealFog).not.toHaveBeenCalled()
    })

    it('redo on a reveal action calls revealFog', () => {
      const revealFog = vi.fn()
      const hideFog = vi.fn()
      const cells = [{ x: 0, y: 0 }]
      const action = createFogAction('map1', cells, true, revealFog, hideFog)

      action.redo()
      expect(revealFog).toHaveBeenCalledWith('map1', cells)
      expect(hideFog).not.toHaveBeenCalled()
    })

    it('undo on a hide action calls revealFog', () => {
      const revealFog = vi.fn()
      const hideFog = vi.fn()
      const cells = [{ x: 5, y: 5 }]
      const action = createFogAction('map1', cells, false, revealFog, hideFog)

      action.undo()
      expect(revealFog).toHaveBeenCalledWith('map1', cells)
    })
  })
})
