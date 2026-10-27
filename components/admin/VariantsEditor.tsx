"use client";

import { useRef, useState } from "react";
import { Box, Camera, ChevronDown, Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { ModelMaterial } from "@/components/admin/ModelUploader";
import { useT } from "@/lib/i18n/client";
import { fill } from "@/lib/admin/list";
import { formatGEL, cn } from "@/lib/utils";
import {
  MAX_VARIANTS,
  newVariantId,
  type ProductVariant,
  type VariantSlot,
} from "@/lib/design/variants";
import { ModelVariantError, variantFromModel } from "@/lib/uploads/variantFromModel";

/**
 * A 3D product's material variants in the product form (`lib/design/variants.ts`): one model,
 * several looks — a sofa in black leather and in white. Each variant has a name, the swatch the
 * studio shows, an optional price and photo, and the materials of the model it changes: picked
 * from the materials the turntable read off the GLB, each given a colour (over its own texture,
 * keeping the grain, or plain), how glossy it is, and if wanted a texture of its own. The variant
 * being edited is shown on the turntable above (`previewId`), and its photo can be taken off it.
 *
 * A variant can also be read off a second model of the same product ("from another model"): the
 * store sent the sofa twice, in two fabrics; that file is only read in the browser, the parts that
 * look different become the variant and their textures are uploaded (`lib/uploads/variantFromModel`).
 */
export function VariantsEditor({
  variants,
  onChange,
  modelUrl,
  materials,
  basePrice,
  previewId,
  onPreview,
  onPhoto,
}: {
  variants: ProductVariant[];
  onChange: (variants: ProductVariant[]) => void;
  /** The product's own model, which a second model is compared with. */
  modelUrl: string;
  /** The model's materials, read by the turntable; empty while no model is loaded. */
  materials: ModelMaterial[];
  basePrice: number;
  previewId: string | null;
  onPreview: (id: string | null) => void;
  /** The turntable as it shows now, uploaded as a photo: its URL. */
  onPhoto: () => Promise<string | null>;
}) {
  const t = useT();
  const f = t.admin.forms;
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<"reading" | "uploading" | null>(null);
  const [notes, setNotes] = useState<{ kind: "ok" | "warn" | "error"; text: string }[]>([]);

  /** A variant read off a second model of the same product; that file is not uploaded. */
  const fromModel = async (file: File) => {
    if (fileRef.current) fileRef.current.value = "";
    setNotes([]);
    setReading("reading");
    try {
      const result = await variantFromModel(modelUrl, file, setReading);
      const next: { kind: "ok" | "warn" | "error"; text: string }[] = [];
      if (!result.variant) next.push({ kind: "warn", text: f.variantFromModelSame });
      else {
        onChange([...variants, result.variant]);
        onPreview(result.variant.id);
        next.push({ kind: "ok", text: fill(f.variantFromModelDone, { n: result.variant.slots.length }) });
      }
      if (result.by === "order") next.push({ kind: "warn", text: f.variantFromModelByOrder });
      if (result.unmatched.length > 0) next.push({ kind: "warn", text: fill(f.variantFromModelUnmatched, { names: result.unmatched.join(", ") }) });
      if (result.skipped.length > 0) next.push({ kind: "warn", text: fill(f.variantFromModelSkipped, { names: result.skipped.join(", ") }) });
      setNotes(next);
    } catch (e) {
      console.error(e);
      const code = e instanceof ModelVariantError ? e.code : null;
      setNotes([{ kind: "error", text: code === "NOT_GLB" ? f.variantFromModelNotGlb : code === "NO_SHARED_MATERIALS" ? f.variantFromModelNoMatch : f.variantFromModelFailed }]);
    } finally {
      setReading(null);
    }
  };

  const update = (id: string, change: (v: ProductVariant) => ProductVariant) =>
    onChange(variants.map((v) => (v.id === id ? change(v) : v)));

  const add = () => {
    const id = newVariantId();
    onChange([...variants, { id, nameKa: "", nameEn: null, nameRu: null, colorHex: "#8A8A8A", imageUrl: null, pricePerUnit: null, slots: [] }]);
    onPreview(id);
  };

  const remove = (id: string) => {
    onChange(variants.filter((v) => v.id !== id));
    if (previewId === id) onPreview(null);
  };

  const photo = async (id: string) => {
    onPreview(id);
    setPhotoFor(id);
    // A frame for the turntable to draw the look before it is photographed.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const url = await onPhoto();
    setPhotoFor(null);
    if (url) update(id, (v) => ({ ...v, imageUrl: url }));
  };

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{f.variantsTitle}</p>
          <p className="max-w-xl text-xs text-ink-muted">{f.variantsHint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={variants.length >= MAX_VARIANTS || reading != null || !modelUrl} title={f.variantFromModelHint}>
            {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Box className="h-4 w-4" />}
            {reading === "reading" ? f.variantFromModelReading : reading === "uploading" ? f.variantFromModelUploading : f.variantFromModel}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={add} disabled={variants.length >= MAX_VARIANTS}>
            <Plus className="h-4 w-4" />
            {f.variantAdd}
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".glb,model/gltf-binary"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) fromModel(file);
          }}
        />
      </div>
      <p className="text-[11px] text-ink-muted">{f.variantFromModelHint}</p>
      {notes.map((note, i) => (
        <p key={i} className={cn("text-xs", note.kind === "ok" ? "text-success" : note.kind === "warn" ? "text-warning" : "text-danger")}>
          {note.text}
        </p>
      ))}
      {materials.length === 0 && variants.length > 0 && <p className="text-xs text-warning">{f.variantsNoModel}</p>}

      {variants.map((variant) => {
        const previewing = previewId === variant.id;
        const missingName = !variant.nameKa.trim();
        const missingPart = variant.slots.length === 0;
        // Materials a variant names that the loaded model does not have (another file uploaded since).
        const stray = materials.length > 0 ? variant.slots.filter((s) => !materials.some((m) => m.name === s.material)) : [];
        return (
          <div key={variant.id} className={cn("space-y-3 rounded-xl border bg-bg-surface p-3", previewing ? "border-olive ring-1 ring-olive/30" : "border-line")}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="color"
                value={variant.colorHex}
                onChange={(e) => update(variant.id, (v) => ({ ...v, colorHex: e.target.value.toUpperCase() }))}
                className="h-9 w-11 cursor-pointer rounded-lg border border-line"
                aria-label={f.variantSwatch}
                title={f.variantSwatch}
              />
              <Input
                value={variant.nameKa}
                onChange={(e) => update(variant.id, (v) => ({ ...v, nameKa: e.target.value }))}
                placeholder={f.variantNameKa}
                aria-label={f.variantNameKa}
                className="min-w-[10rem] flex-1"
              />
              <Input
                value={variant.nameEn ?? ""}
                onChange={(e) => update(variant.id, (v) => ({ ...v, nameEn: e.target.value || null }))}
                placeholder={f.variantNameEn}
                aria-label={f.variantNameEn}
                className="min-w-[10rem] flex-1"
              />
              <Button type="button" variant={previewing ? "default" : "ghost"} size="sm" onClick={() => onPreview(previewing ? null : variant.id)} disabled={materials.length === 0}>
                {previewing ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {previewing ? f.variantPreviewing : f.variantPreview}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(variant.id)} aria-label={f.variantRemove} title={f.variantRemove}>
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{f.variantPrice}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={variant.pricePerUnit ?? ""}
                  onChange={(e) => update(variant.id, (v) => ({ ...v, pricePerUnit: e.target.value ? Number(e.target.value) : null }))}
                  placeholder={formatGEL(basePrice)}
                />
                <p className="text-[11px] text-ink-muted">{f.variantPriceHint}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{f.variantPhoto}</Label>
                <div className="flex items-center gap-2">
                  {variant.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- an uploaded photo, shown as it is
                    <img src={variant.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-line object-cover" />
                  ) : (
                    <span className="h-10 w-10 rounded-lg border border-dashed border-line" />
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => photo(variant.id)} disabled={materials.length === 0 || photoFor != null}>
                    {photoFor === variant.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                    {f.variantPhotoFromModel}
                  </Button>
                  {variant.imageUrl && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => update(variant.id, (v) => ({ ...v, imageUrl: null }))}>
                      {f.variantPhotoClear}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink">{f.variantParts}</p>
              {materials.length === 0 ? (
                <p className="text-[11px] text-ink-muted">{f.variantsNoModel}</p>
              ) : (
                <ul className="space-y-1.5">
                  {materials.map((material) => {
                    const slot = variant.slots.find((s) => s.material === material.name);
                    return (
                      <SlotRow
                        key={material.name}
                        material={material}
                        slot={slot ?? null}
                        onChange={(next) =>
                          update(variant.id, (v) => {
                            const had = v.slots.some((s) => s.material === material.name);
                            const slots = !next ? v.slots.filter((s) => s.material !== material.name) : had ? v.slots.map((s) => (s.material === material.name ? next : s)) : [...v.slots, next];
                            // The swatch follows the first part's colour until it is set by hand.
                            const follows = v.colorHex.toUpperCase() === (v.slots[0]?.colorHex ?? "#8A8A8A").toUpperCase();
                            const first = slots[0]?.colorHex;
                            return { ...v, slots, colorHex: follows && first ? first.toUpperCase() : v.colorHex };
                          })
                        }
                      />
                    );
                  })}
                </ul>
              )}
              {stray.length > 0 && <p className="text-[11px] text-warning">{fill(f.variantStrayParts, { names: stray.map((s) => s.material).join(", ") })}</p>}
            </div>

            {(missingName || missingPart) && <p className="text-[11px] text-danger">{missingName ? f.variantNeedsName : f.variantNeedsPart}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** One material of the model in a variant: off, or on with its colour, grain, gloss and texture. */
function SlotRow({ material, slot, onChange }: { material: ModelMaterial; slot: VariantSlot | null; onChange: (slot: VariantSlot | null) => void }) {
  const t = useT();
  const f = t.admin.forms;
  const [textureOpen, setTextureOpen] = useState(!!(slot?.colorUrl || slot?.normalUrl || slot?.roughnessUrl));
  const set = (change: Partial<VariantSlot>) => onChange({ ...(slot ?? { material: material.name }), ...change });
  return (
    <li className={cn("rounded-xl border p-2", slot ? "border-olive/40 bg-olive-soft/40" : "border-line")}>
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <input type="checkbox" checked={!!slot} onChange={(e) => onChange(e.target.checked ? { material: material.name, colorHex: material.colorHex, keepTexture: material.textured } : null)} />
        <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border border-line" style={{ backgroundColor: material.colorHex }} />
        <span className="min-w-0 flex-1 truncate font-medium text-ink">{material.name}</span>
        <span className="shrink-0 text-ink-muted">
          {fill(f.variantPartCount, { n: material.parts })}
          {material.textured ? ` · ${f.variantTextured}` : ""}
        </span>
      </label>
      {slot && (
        <div className="mt-2 space-y-2 pl-6">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <input
                type="color"
                value={slot.colorHex ?? "#FFFFFF"}
                onChange={(e) => set({ colorHex: e.target.value.toUpperCase() })}
                className="h-8 w-10 cursor-pointer rounded-lg border border-line"
                aria-label={f.variantColour}
              />
              {f.variantColour}
            </span>
            {material.textured && !slot.colorUrl && (
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={slot.keepTexture !== false} onChange={(e) => set({ keepTexture: e.target.checked })} />
                {f.variantKeepTexture}
              </label>
            )}
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={slot.roughness != null} onChange={(e) => set({ roughness: e.target.checked ? 0.6 : null })} />
              {f.variantGloss}
            </label>
            {slot.roughness != null && (
              <span className="flex items-center gap-1.5 text-ink-muted">
                {f.variantGlossy}
                <input type="range" min={0} max={1} step={0.05} value={slot.roughness} onChange={(e) => set({ roughness: Number(e.target.value) })} aria-label={f.variantGloss} />
                {f.variantMatt}
              </span>
            )}
          </div>
          <button type="button" onClick={() => setTextureOpen((v) => !v)} className="flex items-center gap-1 text-[11px] font-medium text-ink-muted hover:text-ink">
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", textureOpen && "rotate-180")} />
            {f.variantTexture}
          </button>
          {textureOpen && (
            <div className="space-y-2">
              <p className="text-[11px] text-ink-muted">{f.variantTextureHint}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">{f.variantColourMap}</Label>
                  <ImageUploader value={slot.colorUrl ?? ""} onChange={(url) => set({ colorUrl: url || null })} folder="textures" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{f.variantNormalMap}</Label>
                  <ImageUploader value={slot.normalUrl ?? ""} onChange={(url) => set({ normalUrl: url || null })} folder="textures" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{f.variantRoughnessMap}</Label>
                  <ImageUploader value={slot.roughnessUrl ?? ""} onChange={(url) => set({ roughnessUrl: url || null })} folder="textures" />
                </div>
              </div>
              <label className="flex max-w-xs items-center gap-2 text-xs">
                {f.variantRepeat}
                <Input type="number" min="0.1" max="100" step="0.1" value={slot.repeat ?? ""} placeholder="1" onChange={(e) => set({ repeat: e.target.value ? Number(e.target.value) : null })} className="h-8" />
              </label>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
