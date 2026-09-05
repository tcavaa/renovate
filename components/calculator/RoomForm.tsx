'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useT } from '@/lib/i18n/client';
import { roomTypeLabel, formatM2L } from '@/lib/i18n/labels';
import { ROOM_TYPES } from '@/lib/calculator/constants';
import { computeRoomAreas } from '@/lib/calculator/materials';
import type { Room, RoomType } from '@/lib/calculator/types';

export function RoomForm({ onAdd }: { onAdd: (room: Room) => void }) {
  const ka = useT();
  const [type, setType] = useState<RoomType>('living_room');
  const [width, setWidth] = useState<string>('4');
  const [length, setLength] = useState<string>('5');
  const [height, setHeight] = useState<string>(
    String(ROOM_TYPES.living_room.defaultHeight)
  );
  const [name, setName] = useState<string>(roomTypeLabel(ka, 'living_room'));

  const widthNum = Number(width) || 0;
  const lengthNum = Number(length) || 0;
  const previewM2 = Number((widthNum * lengthNum).toFixed(2));

  const handleTypeChange = (v: RoomType) => {
    setType(v);
    setHeight(String(ROOM_TYPES[v].defaultHeight));
    setName(roomTypeLabel(ka, v));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (widthNum <= 0 || lengthNum <= 0) return;
    const room = computeRoomAreas({
      id: nanoid(),
      type,
      nameKa: name.trim() || roomTypeLabel(ka, type),
      width: widthNum,
      length: lengthNum,
      height: Number(height) || ROOM_TYPES[type].defaultHeight,
    });
    onAdd(room);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ka.rooms.add}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{ka.rooms.type}</Label>
              <Select value={type} onValueChange={(v) => handleTypeChange(v as RoomType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(ROOM_TYPES).map((key) => (
                    <SelectItem key={key} value={key}>
                      {roomTypeLabel(ka, key)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.rooms.name}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>{ka.rooms.width}</Label>
              <Input
                type="number"
                min={0.5}
                step={0.1}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.rooms.length}</Label>
              <Input
                type="number"
                min={0.5}
                step={0.1}
                value={length}
                onChange={(e) => setLength(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.rooms.height}</Label>
              <Input
                type="number"
                min={2}
                step={0.05}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md bg-bg-base px-4 py-3">
            <span className="text-sm text-ink-muted">{ka.rooms.floorM2}:</span>
            <span className="font-serif text-lg font-semibold text-brand">
              {formatM2L(ka, previewM2)}
            </span>
          </div>
          <Button type="submit" size="lg" disabled={widthNum <= 0 || lengthNum <= 0}>
            <Plus className="h-4 w-4" />
            {ka.rooms.add}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
