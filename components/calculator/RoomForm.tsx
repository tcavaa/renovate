'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel, formatM2L } from '@/lib/i18n/labels';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { computeRoomAreas } from '@/lib/calculator/materials';
import type { Room, RoomType } from '@/lib/calculator/types';

/** Manual room entry: type, name, three dimensions, a live area read-out and one add button. */
export function RoomForm({ onAdd }: { onAdd: (room: Room) => void }) {
  const t = useT();
  const [type, setType] = useState<RoomType>('living_room');
  const [width, setWidth] = useState('4');
  const [length, setLength] = useState('5');
  const [height, setHeight] = useState(String(ROOM_TYPES.living_room.defaultHeight));
  const [name, setName] = useState(roomTypeLabel(t, 'living_room'));

  const widthNum = Number(width) || 0;
  const lengthNum = Number(length) || 0;
  const previewM2 = Number((widthNum * lengthNum).toFixed(2));
  const valid = widthNum > 0 && lengthNum > 0;

  const handleTypeChange = (v: RoomType) => {
    setType(v);
    setHeight(String(ROOM_TYPES[v].defaultHeight));
    setName(roomTypeLabel(t, v));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onAdd(
      computeRoomAreas({
        id: nanoid(),
        type,
        nameKa: name.trim() || roomTypeLabel(t, type),
        width: widthNum,
        length: lengthNum,
        height: Number(height) || ROOM_TYPES[type].defaultHeight,
      })
    );
  };

  return (
    <form onSubmit={handleSubmit} className="border border-line bg-bg-surface">
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.rooms.type}</Label>
          <Select value={type} onValueChange={(v) => handleTypeChange(v as RoomType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(ROOM_TYPES).map((key) => (
                <SelectItem key={key} value={key}>
                  {roomTypeLabel(t, key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="eyebrow">{t.rooms.name}</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          {(
            [
              [t.rooms.width, width, setWidth, 0.5, 0.1],
              [t.rooms.length, length, setLength, 0.5, 0.1],
              [t.rooms.height, height, setHeight, 2, 0.05],
            ] as Array<[string, string, (v: string) => void, number, number]>
          ).map(([label, value, set, min, step]) => (
            <div key={label} className="space-y-1.5">
              <Label className="eyebrow">{label}</Label>
              <Input type="number" min={min} step={step} value={value} onChange={(e) => set(e.target.value)} className="tabular-nums" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-line bg-sand-light px-5 py-3">
        <p className="text-sm text-ink-muted">
          {t.rooms.floorM2}: <span className="font-serif text-lg font-semibold text-ink">{formatM2L(t, previewM2)}</span>
        </p>
        <Button type="submit" variant="ink" disabled={!valid}>
          <Plus className="h-4 w-4" />
          {t.rooms.add}
        </Button>
      </div>
    </form>
  );
}
