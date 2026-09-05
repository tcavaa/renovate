'use client';

import { BadgeCheck, Phone, Star } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { formatGEL } from '@/lib/utils';
import type { Worker } from '@/lib/db/schema';

export function WorkerCard({ worker }: { worker: Worker }) {
  const ka = useT();
  const initials = worker.nameKa
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return (
    <Card className="hover:shadow-cardHover transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand/10 font-serif text-lg font-bold text-brand">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-serif text-base font-semibold">{worker.nameKa}</h3>
              {worker.isVerified && (
                <BadgeCheck className="h-4 w-4 text-success" aria-label={ka.workers.verified} />
              )}
            </div>
            <p className="text-sm text-ink-muted">{worker.specialty}</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
              <span className="font-medium text-ink">{Number(worker.rating).toFixed(1)}</span>
              <span>({worker.reviewCount})</span>
            </div>
          </div>
        </div>

        {worker.bio && (
          <p className="mt-3 line-clamp-2 text-sm text-ink-muted">{worker.bio}</p>
        )}

        <div className="mt-4 flex items-center justify-between">
          <div>
            {worker.priceUnit === 'm2' && worker.pricePerM2 ? (
              <span className="font-serif text-lg font-semibold text-brand">
                {formatGEL(Number(worker.pricePerM2))} / მ²
              </span>
            ) : worker.pricePerUnit ? (
              <span className="font-serif text-lg font-semibold text-brand">
                {formatGEL(Number(worker.pricePerUnit))} / ცალი
              </span>
            ) : (
              <Badge variant="outline">ფასი შეთანხმებით</Badge>
            )}
          </div>
          {worker.phone && (
            <Button size="sm" variant="outline" asChild>
              <a href={`tel:${worker.phone}`}>
                <Phone className="h-4 w-4" />
                {ka.workers.contact}
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
