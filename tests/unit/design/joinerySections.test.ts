import { describe, expect, it } from 'vitest';
import { cabinetPiece, MIN_SECTION_MM, withoutSlivers } from '@/lib/design/decor/joinery';
import { refreshRoom, roomEdges } from '@/lib/design/planGeometry';
import { decorPieceSchema } from '@/lib/validations/design.schema';
import type { CabinetSection, PlanRoom } from '@/lib/design/types';

const section = (kind: CabinetSection['kind'], widthMm: number, itemId?: string): CabinetSection => ({ kind, widthMm, heightMm: 850, depthMm: 500, ...(itemId ? { itemId } : {}) });
const widths = (sections: CabinetSection[]) => sections.map((s) => `${s.kind}:${s.widthMm}`);
const bathroom: PlanRoom = refreshRoom({ id: 'b', type: 'bathroom', name: 'b', polygon: [{ x: 0, z: 0 }, { x: 3, z: 0 }, { x: 3, z: 2.4 }, { x: 0, z: 2.4 }], heightM: 2.7, areaM2: 0, perimeterM: 0, openings: [] });

describe('a cabinet is made of sections that can be made', () => {
  it('gives a filler too narrow to be a cupboard to the section beside it, the basin before a machine\'s column', () => {
    expect(widths(withoutSlivers([section('basin', 1060, 's'), section('doors', 77), section('washer', 656, 'w')]))).toEqual(['basin:1137', 'washer:656']);
    expect(widths(withoutSlivers([section('washer', 656, 'w'), section('doors', 64), section('basin', 900, 's')]))).toEqual(['washer:656', 'basin:964']);
    // Between two machines' columns, the one before it widens.
    expect(widths(withoutSlivers([section('washer', 656, 'w'), section('doors', 40), section('boiler', 600, 'b')]))).toEqual(['washer:696', 'boiler:600']);
  });

  it('keeps a section as narrow as a cupboard may be, and the cabinet\'s width whatever it merges', () => {
    const kept = [section('basin', 900, 's'), section('doors', MIN_SECTION_MM), section('washer', 656, 'w')];
    expect(withoutSlivers(kept)).toEqual(kept);
    const narrow = [section('doors', 30), section('coats', 800), section('doors', 99), section('shoes', 500), section('doors', 5)];
    const out = withoutSlivers(narrow);
    expect(out.every((s) => s.widthMm >= MIN_SECTION_MM)).toBe(true);
    expect(out.reduce((a, s) => a + s.widthMm, 0)).toBe(narrow.reduce((a, s) => a + s.widthMm, 0));
  });

  it('never folds away a section something stands in', () => {
    const out = withoutSlivers([section('basin', 900, 's'), section('washer', 80, 'w')]);
    expect(out.map((s) => s.itemId)).toEqual(['s', 'w']);
  });

  it('builds a piece the save route takes, its span unchanged', () => {
    const edge = roomEdges(bathroom.polygon)[0];
    const piece = cabinetPiece('decor-b-joinery', bathroom, edge, 0.4, [section('basin', 1060, 's'), section('doors', 77), section('washer', 656, 'w')], {});
    expect(piece.span.to - piece.span.from).toBeCloseTo(1.793, 3);
    expect(piece.params.sections?.map((s) => s.kind)).toEqual(['basin', 'washer']);
    expect(decorPieceSchema.safeParse(piece).success).toBe(true);
    // The save route's narrowest section is the joiner's: one millimetre less is refused.
    const thin = { ...piece, params: { ...piece.params, sections: [section('doors', MIN_SECTION_MM - 1), section('basin', 900, 's')] } };
    expect(decorPieceSchema.safeParse(thin).success).toBe(false);
  });
});
