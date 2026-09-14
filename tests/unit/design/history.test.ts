import { describe, expect, it } from 'vitest';
import { emptyHistory, pushHistory, redoHistory, undoHistory } from '@/lib/design/history';

describe('history', () => {
  it('undoes and redoes in order and forgets the future on a new change', () => {
    let h = emptyHistory<number>();
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    const undone = undoHistory(h, 3)!;
    expect(undone.snapshot).toBe(2);
    expect(undone.history.future).toEqual([3]);
    const again = undoHistory(undone.history, 2)!;
    expect(again.snapshot).toBe(1);
    const redone = redoHistory(again.history, 1)!;
    expect(redone.snapshot).toBe(2);
    expect(redone.history.past).toEqual([1]);
    // A new change after an undo drops what could have been redone.
    const branched = pushHistory(redone.history, 2);
    expect(branched.future).toEqual([]);
    expect(undoHistory(emptyHistory<number>(), 0)).toBeNull();
    expect(redoHistory(emptyHistory<number>(), 0)).toBeNull();
  });

  it('keeps the stack bounded', () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 10; i++) h = pushHistory(h, i, 4);
    expect(h.past).toEqual([6, 7, 8, 9]);
  });
});
