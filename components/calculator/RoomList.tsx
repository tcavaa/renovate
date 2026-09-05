'use client';

import { Trash2, Ruler, ArrowDownToLine } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { formatM2L, roomTypeLabel } from '@/lib/i18n/labels';
import type { Room } from '@/lib/calculator/types';

export function RoomList({
  rooms,
  onRemove,
}: {
  rooms: Room[];
  onRemove: (id: string) => void;
}) {
  const ka = useT();
  if (rooms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-ink-muted">
          <Ruler className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p>{ka.rooms.empty}</p>
        </CardContent>
      </Card>
    );
  }

  const totalM2 = rooms.reduce((s, r) => s + r.floorM2, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-md bg-bg-surface border border-line px-4 py-3">
        <span className="text-sm text-ink-muted">
          {ka.rooms.total}: <strong className="text-ink">{rooms.length}</strong>
        </span>
        <span className="text-sm">
          {ka.rooms.totalM2}:{' '}
          <strong className="font-serif text-base text-brand">{formatM2L(ka, totalM2)}</strong>
        </span>
      </div>
      <div className="grid gap-3">
        {rooms.map((room) => (
          <Card key={room.id} className="hover:shadow-cardHover transition-shadow">
            <CardContent className="flex items-center gap-4 p-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-serif font-semibold">{room.nameKa}</h4>
                  <Badge variant="outline">{roomTypeLabel(ka, room.type)}</Badge>
                  {room.isWetRoom && <Badge variant="secondary">{ka.rooms.wet}</Badge>}
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {room.width}{ka.units.m} × {room.length}{ka.units.m} × {room.height}{ka.units.m}
                  {' · '}
                  {ka.rooms.wallsLabel} {formatM2L(ka, room.wallM2)}
                </p>
              </div>
              <div className="text-right">
                <div className="font-serif text-lg font-semibold text-brand">
                  {formatM2L(ka, room.floorM2)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(room.id)}
                aria-label={ka.rooms.remove}
              >
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
