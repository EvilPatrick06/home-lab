import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDungeonInput } from './useDungeonInput.js';

function setup(overrides = {}) {
  const spies = {
    tryMove: vi.fn(),
    quaffPotion: vi.fn(),
    castSpell: vi.fn(),
    interactWithWorld: vi.fn(),
    onExit: vi.fn(),
  };
  const props = {
    phase: 'world',
    battle: null,
    runState: 'alive',
    map: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    containerRef: { current: null },
    ...spies,
    ...overrides,
  };
  const view = renderHook((p) => useDungeonInput(p), { initialProps: props });
  return { view, spies };
}

function key(type, k) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
  });
}

describe('useDungeonInput', () => {
  it('maps arrow keys to tryMove with the right deltas', () => {
    const { spies } = setup();
    key('keydown', 'ArrowRight');
    expect(spies.tryMove).toHaveBeenCalledWith(1, 0, 'right');
    key('keyup', 'ArrowRight');
    key('keydown', 'ArrowUp');
    expect(spies.tryMove).toHaveBeenLastCalledWith(0, -1, 'up');
  });

  it('maps WASD to tryMove', () => {
    const { spies } = setup();
    key('keydown', 'd');
    expect(spies.tryMove).toHaveBeenLastCalledWith(1, 0, 'right');
    key('keyup', 'd');
    key('keydown', 'a');
    expect(spies.tryMove).toHaveBeenLastCalledWith(-1, 0, 'left');
    key('keyup', 'a');
    key('keydown', 's');
    expect(spies.tryMove).toHaveBeenLastCalledWith(0, 1, 'down');
  });

  it('does not refire tryMove while a key is held; refires after keyup', () => {
    const { spies } = setup();
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight'); // held — ignored
    expect(spies.tryMove).toHaveBeenCalledTimes(1);
    key('keyup', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(spies.tryMove).toHaveBeenCalledTimes(2);
  });

  it('casts spells on Z / X / C (indices 0/1/2)', () => {
    const { spies } = setup();
    key('keydown', 'z');
    expect(spies.castSpell).toHaveBeenCalledWith(0);
    key('keydown', 'x');
    expect(spies.castSpell).toHaveBeenCalledWith(1);
    key('keydown', 'c');
    expect(spies.castSpell).toHaveBeenCalledWith(2);
  });

  it('quaffs potions on 1 / 2 / 3 (indices 0/1/2)', () => {
    const { spies } = setup();
    key('keydown', '1');
    expect(spies.quaffPotion).toHaveBeenCalledWith(0);
    key('keydown', '2');
    expect(spies.quaffPotion).toHaveBeenCalledWith(1);
    key('keydown', '3');
    expect(spies.quaffPotion).toHaveBeenCalledWith(2);
  });

  it('interacts with the world on E', () => {
    const { spies } = setup();
    key('keydown', 'e');
    expect(spies.interactWithWorld).toHaveBeenCalledTimes(1);
  });

  it('exits on Escape', () => {
    const { spies } = setup();
    key('keydown', 'Escape');
    expect(spies.onExit).toHaveBeenCalledTimes(1);
  });

  it('binds no listeners outside the world phase', () => {
    const { spies } = setup({ phase: 'setup' });
    key('keydown', 'ArrowRight');
    key('keydown', 'z');
    expect(spies.tryMove).not.toHaveBeenCalled();
    expect(spies.castSpell).not.toHaveBeenCalled();
  });

  it('ignores movement/interact during a battle but still casts spells', () => {
    const { spies } = setup({ battle: { type: 'mob' } });
    key('keydown', 'ArrowRight');
    key('keydown', 'e');
    expect(spies.tryMove).not.toHaveBeenCalled();
    expect(spies.interactWithWorld).not.toHaveBeenCalled();
    key('keydown', 'z');
    expect(spies.castSpell).toHaveBeenCalledWith(0);
  });

  it('when not alive, only Escape acts (spell gate is before the alive gate)', () => {
    const { spies } = setup({ runState: 'death' });
    key('keydown', 'ArrowRight');
    expect(spies.tryMove).not.toHaveBeenCalled();
    key('keydown', 'z');
    expect(spies.castSpell).toHaveBeenCalledWith(0);
    key('keydown', 'Escape');
    expect(spies.onExit).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners on unmount', () => {
    const { view, spies } = setup();
    view.unmount();
    key('keydown', 'ArrowRight');
    expect(spies.tryMove).not.toHaveBeenCalled();
  });
});
