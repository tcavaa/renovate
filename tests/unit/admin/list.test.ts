import { describe, expect, it } from 'vitest';
import { inIdOrder } from '@/lib/admin/list';

describe('a page read by id after its ids were sorted (inIdOrder)', () => {
  const row = (id: number) => ({ id, name: `project ${id}` });

  it('puts the rows back in the order the ids were sorted in, whatever order they were read in', () => {
    expect(inIdOrder([7, 3, 9, 1], [row(1), row(9), row(7), row(3)]).map((r) => r.id)).toEqual([7, 3, 9, 1]);
  });

  it('leaves out an id whose row went between the two reads, and reads nothing into an empty page', () => {
    expect(inIdOrder([4, 2, 8], [row(8), row(4)]).map((r) => r.id)).toEqual([4, 8]);
    expect(inIdOrder([], [row(1)])).toEqual([]);
  });
});
