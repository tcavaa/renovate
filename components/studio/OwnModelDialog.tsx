'use client';

/**
 * A piece of the person's own furniture, for their flats: the wardrobe they are keeping,
 * the table they already own. Two ways in — a GLB model, placeable at once, shown on the
 * turntable the admin's uploader uses so its size can be read off it and a photo rendered
 * from it; or a photo, which goes in as a product waiting for its model (the conversion
 * comes later; until then the item stands under "my items" and cannot be placed). Either
 * way the product is the person's alone, costs nothing and is sold by nobody.
 */

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Box, Camera, Loader2, LogIn, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { mountPreview, type PreviewHandle } from '@/components/admin/ModelUploader';
import { ARCHETYPES, archetypeLabel } from '@/lib/design/catalog';
import { isFixtureProductKind } from '@/lib/design/electrical';
import { isOpeningProductKind } from '@/lib/design/openings';
import { isRadiatorProductKind } from '@/lib/design/radiators';
import type { CatalogProduct } from '@/lib/design/matcher';
import { useLocale, useT } from '@/lib/i18n/client';
import { apiErrorMessage } from '@/lib/i18n/labels';
import { cn } from '@/lib/utils';

/** The kinds a piece of one's own can be — furniture, not a fitting, a door or a radiator. */
const FURNITURE_KINDS = Object.values(ARCHETYPES)
  .filter((a) => !isFixtureProductKind(a.kind) && !isOpeningProductKind(a.kind) && !isRadiatorProductKind(a.kind))
  .map((a) => a.kind);

type Dims = { widthCm: string; depthCm: string; heightCm: string };

/** The kind's standard size, in whole centimetres. */
function kindDims(kind: string): Dims {
  const size = ARCHETYPES[kind]?.size;
  return size ? { widthCm: String(Math.round(size.width * 100)), depthCm: String(Math.round(size.depth * 100)), heightCm: String(Math.round(size.height * 100)) } : { widthCm: '', depthCm: '', heightCm: '' };
}

export function OwnModelDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; /** The product as the catalogue now has it; the studio decides what to do with it. */ onCreated: (product: CatalogProduct) => void }) {
  const t = useT();
  const locale = useLocale();
  const { status } = useSession();
  // Back to the page the dialogue was opened on (the studio of this project) once signed in.
  const pathname = usePathname();
  const [mode, setMode] = useState<'model' | 'photo'>('model');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState(FURNITURE_KINDS[0]);
  const [dims, setDims] = useState<Dims>(() => kindDims(FURNITURE_KINDS[0]));
  /** Where the size came from: read off the model, or the kind's standard. */
  const [dimsFrom, setDimsFrom] = useState<'model' | 'kind'>('kind');
  /** The turntable's verdict on the URL it was given last. */
  const [loaded, setLoaded] = useState<{ url: string; ok: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<PreviewHandle | null>(null);

  // The chosen file as a URL the turntable and the picture can show.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // A model on the turntable, measured: its real size fills the fields unless the file is
  // normalised (a longest side of exactly one unit says nothing about the piece).
  useEffect(() => {
    const host = hostRef.current;
    if (mode !== 'model' || !previewUrl || !host) return;
    let cancelled = false;
    mountPreview(host, previewUrl)
      .then(({ handle, measurement }) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        setLoaded({ url: previewUrl, ok: true });
        if (!measurement.normalised) {
          setDims({ widthCm: String(measurement.widthCm), depthCm: String(measurement.depthCm), heightCm: String(measurement.heightCm) });
          setDimsFrom('model');
        }
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setLoaded({ url: previewUrl, ok: false });
      });
    return () => {
      cancelled = true;
      handleRef.current?.dispose();
      handleRef.current = null;
    };
  }, [mode, previewUrl]);

  const loading = mode === 'model' && !!previewUrl && loaded?.url !== previewUrl;
  const loadFailed = mode === 'model' && !!previewUrl && loaded?.url === previewUrl && !loaded.ok;

  const reset = () => {
    setFile(null);
    setName('');
    setError(null);
    setDimsFrom('kind');
    setDims(kindDims(kind));
  };

  const pickKind = (next: string) => {
    setKind(next);
    if (dimsFrom === 'kind') setDims(kindDims(next));
  };

  const submit = async () => {
    if (!file || !name.trim()) {
      setError(t.design.ownNeedFields);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('name', name.trim());
      body.append('kind', kind);
      for (const key of ['widthCm', 'depthCm', 'heightCm'] as const) if (dims[key]) body.append(key, dims[key]);
      if (mode === 'model' && handleRef.current) {
        const shot = await handleRef.current.snapshot().catch(() => null);
        if (shot) body.append('photo', shot, 'photo.png');
      }
      const res = await fetch('/api/design/models', { method: 'POST', body });
      const json = (await res.json()) as { data: CatalogProduct | null; error: string | null };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'UNKNOWN');
      onCreated(json.data);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(apiErrorMessage(t, e instanceof Error ? e.message : null));
    } finally {
      setSubmitting(false);
    }
  };

  const field = 'h-9 w-full rounded-[8px] border border-line bg-white px-3 text-sm text-ink focus:border-ink focus:outline-none';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto rounded-[18px]">
        <DialogHeader>
          <DialogTitle>{t.design.ownTitle}</DialogTitle>
          <DialogDescription>{t.design.ownDesc}</DialogDescription>
        </DialogHeader>

        {status !== 'authenticated' ? (
          <div className="rounded-[12px] border border-line bg-bg-base p-5 text-center">
            <p className="text-sm text-ink-muted">{t.design.ownSignIn}</p>
            <Button asChild variant="ink" className="mt-4">
              <Link href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}>
                <LogIn className="h-4 w-4" />
                {t.nav.login}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* The two ways in. */}
            <div className="grid grid-cols-2 gap-2" role="tablist">
              {(
                [
                  { id: 'model', icon: Box, label: t.design.ownTabModel, hint: t.design.ownTabModelHint },
                  { id: 'photo', icon: Camera, label: t.design.ownTabPhoto, hint: t.design.ownTabPhotoHint },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  onClick={() => {
                    setMode(tab.id);
                    setFile(null);
                    setError(null);
                  }}
                  className={cn('flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors', mode === tab.id ? 'border-ink bg-ink text-white' : 'border-line bg-bg-surface hover:border-ink/40')}
                >
                  <tab.icon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className={cn('mt-0.5 block text-xs leading-snug', mode === tab.id ? 'text-white/70' : 'text-ink-muted')}>{tab.hint}</span>
                  </span>
                </button>
              ))}
            </div>

            {/* The file, and what it looks like. */}
            <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed p-5 text-center transition-colors', file ? 'border-line bg-bg-base' : 'border-ink/30 bg-bg-base hover:border-ink')}>
              <input
                type="file"
                accept={mode === 'model' ? '.glb,model/gltf-binary' : 'image/png,image/jpeg,image/webp'}
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                  e.target.value = '';
                }}
              />
              <Upload className="h-5 w-5 text-ink-muted" />
              <span className="text-sm font-medium text-ink">{file ? file.name : mode === 'model' ? t.design.ownDropModel : t.design.ownDropPhoto}</span>
              <span className="text-xs text-ink-muted">{mode === 'model' ? t.design.ownDropModelNote : t.design.ownDropPhotoNote}</span>
            </label>

            {previewUrl && mode === 'model' && (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-line bg-bg-base">
                <div ref={hostRef} className="h-full w-full" />
                {loading && (
                  <div className="absolute inset-0 grid place-items-center bg-white/60 text-sm text-ink-muted">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
                {loadFailed && <p className="absolute inset-x-3 bottom-3 rounded-[8px] bg-white/95 px-3 py-2 text-xs text-danger">{t.modelUploader.loadError}</p>}
                {!loading && !loadFailed && <p className="pointer-events-none absolute inset-x-3 bottom-3 text-center text-[11px] text-ink-muted">{t.modelUploader.previewHint}</p>}
              </div>
            )}
            {previewUrl && mode === 'photo' && (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[12px] border border-line bg-bg-base">
                <Image src={previewUrl} alt="" fill unoptimized className="object-contain" />
              </div>
            )}
            {mode === 'photo' && <p className="rounded-[10px] bg-warning/10 px-3 py-2 text-xs leading-relaxed text-ink">{t.design.ownPhotoNote}</p>}

            {/* What it is. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="own-name">{t.design.ownName}</Label>
                <Input id="own-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t.design.ownNamePlaceholder} maxLength={120} />
              </div>
              <div>
                <Label htmlFor="own-kind">{t.design.ownKind}</Label>
                <select id="own-kind" value={kind} onChange={(e) => pickKind(e.target.value)} className={field}>
                  {FURNITURE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {archetypeLabel(k, locale)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <Label>{t.design.ownSize}</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['widthCm', 'depthCm', 'heightCm'] as const).map((key) => (
                  <Input
                    key={key}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={2000}
                    value={dims[key]}
                    aria-label={key}
                    onChange={(e) => {
                      setDims((d) => ({ ...d, [key]: e.target.value }));
                      setDimsFrom('model');
                    }}
                  />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">{dimsFrom === 'model' ? t.design.ownSizeFromModel : t.design.ownSizeDefault}</p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                {t.common.cancel}
              </Button>
              <Button type="button" variant="ink" onClick={submit} disabled={submitting || !file || loading || loadFailed}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {submitting ? t.design.ownSubmitting : t.design.ownSubmit}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
