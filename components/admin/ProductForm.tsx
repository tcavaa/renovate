"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { ImageUploader } from "@/components/admin/ImageUploader";
import {
  ModelUploader,
  type ModelMaterial,
  type ModelMeasurement,
  type ModelUploaderControl,
} from "@/components/admin/ModelUploader";
import { VariantsEditor } from "@/components/admin/VariantsEditor";
import { productVariants, type ProductVariant } from "@/lib/design/variants";
import { useT, useLocale } from "@/lib/i18n/client";
import { apiErrorMessage } from "@/lib/i18n/labels";
import {
  unitLabel,
  pickLocalizedName,
  FIXTURE_KIND_LABEL,
  OPENING_KIND_LABEL,
  EQUIPMENT_KIND_LABEL,
} from "@/lib/i18n/labels";
import { ARCHETYPES, TRIM_CATEGORY_SLUGS } from "@/lib/design/catalog";
import { FIXTURE_PRODUCT_KINDS } from "@/lib/design/electrical";
import { OPENING_PRODUCT_KINDS } from "@/lib/design/openings";
import { STYLES, STYLE_IDS } from "@/lib/design/styles";
import { SURFACE_CATEGORY_SLUGS, type Surface } from "@/lib/design/surfaces";
import { COLOR_FAMILIES, colorFamily, parseHex } from "@/lib/design/colors";
import type { StyleId, TrimProfile } from "@/lib/design/types";
import type { Category, Product, Store } from "@/lib/db/schema";
import {
  buildCategoryTree,
  flattenTree,
  nearestSlug,
  pathOf,
  type CategoryTree,
} from "@/lib/catalog/tree";
import { rememberedListHref } from "@/lib/admin/listMemory";
import { latinSlug } from "@/lib/slug";

const UNIT_KEYS = [
  "m2",
  "linear_m",
  "piece",
  "liter",
  "kg",
  "pack",
  "set",
] as const;
const DEFAULT_COLOR = "#C9C4BA";
const FINISH_SLUGS: ReadonlySet<string> = new Set(SURFACE_CATEGORY_SLUGS);
const TRIM_SLUGS: ReadonlySet<string> = new Set(TRIM_CATEGORY_SLUGS);
const TRIM_PROFILES: TrimProfile[] = [
  "flat",
  "rounded",
  "stepped",
  "ogee",
  "cove",
];
/** The texture preview shows two metres by two, so the repeat size can be checked by eye. */
const PREVIEW_PX = 160;
const PREVIEW_M = 2;

type Specs = Record<string, unknown>;

function asSpecs(value: unknown): Specs {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Specs) }
    : {};
}

/**
 * What the studio makes of a product in this category: a floor or wall finish (laminate,
 * tiles, paint — a texture laid over the room), a moulding (skirting, cornice — a profile run
 * along the walls), or a thing with a model. A category under one of those is one too.
 */
function studioKind(
  tree: CategoryTree<Category>,
  categoryId: string,
): "finish" | "trim" | "model" {
  if (!categoryId) return "model";
  const id = Number(categoryId);
  if (nearestSlug(tree, id, FINISH_SLUGS)) return "finish";
  if (nearestSlug(tree, id, TRIM_SLUGS)) return "trim";
  return "model";
}

/**
 * Every archetype the 3D studio can draw, with the room slot it fills.
 *
 * Read straight from the registry rather than hard-coded, so adding a furniture builder makes
 * it selectable here without anyone remembering to update a list.
 */
const MODEL_KINDS = Object.values(ARCHETYPES).map((a) => ({
  kind: a.kind,
  labelKa: a.labelKa,
  labelEn: a.labelEn,
  labelRu: a.labelRu,
  size: a.size,
}));

/** A 3D kind is found by its key as written and with spaces ("coffee table"). */
const kindKeywords = (kind: string) => [kind, kind.replace(/_/g, " ")];

function asStyleTags(value: unknown): StyleId[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is StyleId => STYLE_IDS.includes(v as StyleId));
}

interface Props {
  product?: Product;
  categories: Category[];
  stores: Store[];
  /**
   * The partner portal: the store is fixed to the account's own, "featured" is not offered,
   * and saving returns to the store's own product list instead of admin's.
   */
  partner?: { storeId: number; backHref: string };
  /** Whether the delete button is offered (`canDeleteProduct`): admin, or a store for its own. */
  canDelete?: boolean;
  /**
   * The fittings', openings' and equipment's names in all three languages
   * (`productKindNames`, read on the server), so the 3D-kind search finds them in any.
   */
  kindNames?: Record<string, string[]>;
}

export function ProductForm({
  product,
  categories,
  stores,
  partner,
  canDelete = false,
  kindNames,
}: Props) {
  const router = useRouter();
  const ka = useT();
  const locale = useLocale();
  // The categories as the tree has them, each under its parent; found by any of their names or
  // the slug, and shown chosen by their whole path.
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const categoryOptions = useMemo<ComboboxOption[]>(() => {
    const nameOf = (c: Category) =>
      pickLocalizedName(locale, c.nameKa, c.nameEn, c.nameRu);
    return flattenTree(tree).map(({ row, depth }) => ({
      value: String(row.id),
      label: nameOf(row),
      depth: depth - 1,
      keywords: [row.nameKa, row.nameEn, row.nameRu, row.slug],
      selectedLabel: pathOf(tree, row.id).map(nameOf).join(" › "),
    }));
  }, [tree, locale]);
  const storeOptions = useMemo<ComboboxOption[]>(
    () => [
      { value: "none", label: ka.admin.forms.storeNone },
      ...stores.map((s) => ({
        value: String(s.id),
        label: s.nameKa,
        keywords: [s.nameEn, s.nameRu, s.city],
      })),
    ],
    [stores, ka],
  );
  // Every kind the studio draws: its furniture (by the archetype's three names), then the
  // fittings, the doors and windows and the equipment (by the dictionaries'), each with its key.
  const kindOptions = useMemo<ComboboxOption[]>(() => {
    const build = ka.build as Record<string, string>;
    const named = (kind: string, icon: string, labelKey: string) => {
      const label = `${icon} ${build[labelKey] ?? kind}`;
      return {
        value: kind,
        label,
        hint: kind,
        selectedLabel: `${label} · ${kind}`,
        keywords: [...kindKeywords(kind), ...(kindNames?.[kind] ?? [])],
      };
    };
    const furniture = MODEL_KINDS.map((m) => {
      const label = pickLocalizedName(locale, m.labelKa, m.labelEn, m.labelRu);
      return {
        value: m.kind,
        label,
        hint: m.kind,
        selectedLabel: `${label} · ${m.kind}`,
        keywords: [m.labelKa, m.labelEn, m.labelRu, ...kindKeywords(m.kind)],
      };
    }).sort((a, b) => a.label.localeCompare(b.label, locale));
    return [
      { value: "none", label: ka.admin.forms.model3dKindNone },
      ...furniture,
      ...FIXTURE_PRODUCT_KINDS.map((kind) =>
        named(kind, "⚡", FIXTURE_KIND_LABEL[kind]),
      ),
      ...OPENING_PRODUCT_KINDS.map((kind) =>
        named(kind, "🚪", OPENING_KIND_LABEL[kind]),
      ),
      ...Object.entries(EQUIPMENT_KIND_LABEL).map(([kind, labelKey]) =>
        named(kind, "🔧", labelKey),
      ),
    ];
  }, [ka, locale, kindNames]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backHref = partner?.backHref ?? "/admin/products";
  const specs = asSpecs(product?.specs);
  const [form, setForm] = useState({
    nameKa: product?.nameKa ?? "",
    nameEn: product?.nameEn ?? "",
    nameRu: product?.nameRu ?? "",
    descriptionKa: product?.descriptionKa ?? "",
    descriptionEn: product?.descriptionEn ?? "",
    descriptionRu: product?.descriptionRu ?? "",
    slug: product?.slug ?? "",
    sku: product?.sku ?? "",
    categoryId: product?.categoryId ? String(product.categoryId) : "",
    pricePerUnit: product?.pricePerUnit ? String(product.pricePerUnit) : "",
    unit: product?.unit ?? "piece",
    brand: product?.brand ?? "",
    imageUrl: product?.imageUrl ?? "",
    isActive: product?.isActive ?? true,
    isFeatured: product?.isFeatured ?? false,
    storeId: partner
      ? String(partner.storeId)
      : product?.storeId
        ? String(product.storeId)
        : "",
    styleTags: asStyleTags(product?.styleTags),
    model3dKind: product?.model3dKind ?? "",
    model3dUrl: product?.model3dUrl ?? "",
    colorHex: product?.colorHex ?? DEFAULT_COLOR,
    widthCm: product?.widthCm != null ? String(product.widthCm) : "",
    depthCm: product?.depthCm != null ? String(product.depthCm) : "",
    heightCm: product?.heightCm != null ? String(product.heightCm) : "",
    // --- a floor or wall finish (`lib/design/surfaces.ts`) ---
    textureUrl: product?.textureUrl ?? "",
    coveragePerUnit:
      product?.coveragePerUnit != null
        ? String(Number(product.coveragePerUnit))
        : "",
    surfaces: Array.isArray(specs.surfaces)
      ? (specs.surfaces.filter(
          (s) => s === "floor" || s === "wall",
        ) as Surface[])
      : ([] as Surface[]),
    wet: specs.wet === true,
    textureScaleM:
      typeof specs.textureScaleM === "number"
        ? String(specs.textureScaleM)
        : "",
    colors: Array.isArray(specs.colors)
      ? specs.colors.filter(
          (c): c is string => typeof c === "string" && parseHex(c) !== null,
        )
      : ([] as string[]),
    // --- a moulding (`lib/design/trims.ts`) ---
    profile: TRIM_PROFILES.includes(specs.profile as TrimProfile)
      ? (specs.profile as TrimProfile)
      : ("" as TrimProfile | ""),
    trimHeightCm:
      typeof specs.heightCm === "number" ? String(specs.heightCm) : "",
    trimDepthCm: typeof specs.depthCm === "number" ? String(specs.depthCm) : "",
  });
  // --- a 3D product's material variants (`lib/design/variants.ts`) ---
  const [variants, setVariants] = useState<ProductVariant[]>(() =>
    productVariants(product?.specs),
  );
  /** The model's materials, as the turntable read them off the GLB. */
  const [modelMaterials, setModelMaterials] = useState<ModelMaterial[]>([]);
  /** The variant shown on the turntable while it is edited. */
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const modelControl = useRef<ModelUploaderControl | null>(null);
  const previewLook = variants.find((v) => v.id === previewVariantId) ?? null;

  const update = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => setForm((f) => ({ ...f, [key]: value }));
  const kind = studioKind(tree, form.categoryId);

  // A new product's slug follows its name, in Latin letters, until the slug is typed by hand; an
  // existing product's is never rewritten by its name (it is the product's address).
  const [slugFollows, setSlugFollows] = useState(!product);
  const [slugTyped, setSlugTyped] = useState(false);
  const slugFromName = latinSlug(form.nameKa);
  const changeName = (nameKa: string) =>
    setForm((f) => ({
      ...f,
      nameKa,
      ...(slugFollows ? { slug: latinSlug(nameKa) } : {}),
    }));
  // A slug typed by hand is tidied as the field is left ("Stol Oslo" → "stol-oslo"); a new
  // product's emptied slug follows the name again.
  const tidySlug = () => {
    if (!form.slug.trim()) {
      if (!product) {
        setSlugFollows(true);
        update("slug", slugFromName);
      }
      return;
    }
    const clean = latinSlug(form.slug);
    if (slugTyped && clean && clean !== form.slug) update("slug", clean);
  };
  // A 3D kind chosen with no size typed yet brings the archetype's real-world size, so the
  // fields are never left empty by accident — an item with no dimensions is laid out at a guess.
  const chooseModelKind = (v: string) => {
    if (v === "none") {
      update("model3dKind", "");
      return;
    }
    const chosen = MODEL_KINDS.find((m) => m.kind === v);
    setForm((f) =>
      chosen && !f.widthCm && !f.depthCm && !f.heightCm
        ? {
            ...f,
            model3dKind: v,
            widthCm: String(Math.round(chosen.size.width * 100)),
            depthCm: String(Math.round(chosen.size.depth * 100)),
            heightCm: String(Math.round(chosen.size.height * 100)),
          }
        : { ...f, model3dKind: v },
    );
  };
  /*
    A stored kind that is no longer in the registry would otherwise show as nothing chosen and
    be lost on the next save. Keep it listed so it is visible and deliberate to change.
  */
  const kindChoices: ComboboxOption[] =
    form.model3dKind &&
    !kindOptions.some((o) => o.value === form.model3dKind)
      ? [
          kindOptions[0],
          { value: form.model3dKind, label: `${form.model3dKind} (?)` },
          ...kindOptions.slice(1),
        ]
      : kindOptions;

  /**
   * Dimensions read from the uploaded GLB. Automatically only into empty fields — an admin
   * who typed the catalogue's numbers keeps them; the "apply" button overrides on purpose.
   */
  const applyMeasurement = (m: ModelMeasurement, { auto }: { auto: boolean }) =>
    setForm((f) => {
      if (auto && (f.widthCm || f.depthCm || f.heightCm)) return f;
      return {
        ...f,
        widthCm: String(m.widthCm),
        depthCm: String(m.depthCm),
        heightCm: String(m.heightCm),
      };
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) {
      setError(ka.admin.forms.chooseCategory);
      return;
    }
    // A texture laid on nothing is a finish the studio never offers.
    if (kind === "finish" && form.textureUrl && form.surfaces.length === 0) {
      setError(ka.admin.forms.finishNeedsSurface);
      return;
    }
    // A variant with no name or no part of the model to change is not one.
    if (
      kind === "model" &&
      variants.some((v) => !v.nameKa.trim() || v.slots.length === 0)
    ) {
      setError(ka.admin.forms.variantIncomplete);
      return;
    }
    setLoading(true);
    setError(null);
    const {
      textureUrl,
      coveragePerUnit,
      surfaces,
      wet,
      textureScaleM,
      colors,
      profile,
      trimHeightCm,
      trimDepthCm,
      ...fields
    } = form;
    // A finish's and a moulding's settings live in `specs`, beside whatever else is there (the
    // calculator's "size: 60×60", the stock textures' maps) — only these keys are written.
    const studio = (() => {
      const next = { ...specs };
      const put = (key: string, value: unknown) => {
        if (
          value == null ||
          value === "" ||
          (Array.isArray(value) && value.length === 0)
        )
          delete next[key];
        else next[key] = value;
      };
      if (kind === "finish") {
        put("surfaces", surfaces);
        next.wet = wet;
        put("textureScaleM", textureScaleM ? Number(textureScaleM) : null);
        put("colors", textureUrl ? colors : null);
        return {
          textureUrl: textureUrl || null,
          coveragePerUnit: coveragePerUnit ? Number(coveragePerUnit) : null,
          specs: next,
        };
      }
      if (kind === "trim") {
        put("profile", profile || null);
        put("heightCm", trimHeightCm ? Number(trimHeightCm) : null);
        put("depthCm", trimDepthCm ? Number(trimDepthCm) : null);
        return { specs: next };
      }
      if (kind === "model") {
        put(
          "variants",
          variants.map((v) => ({
            ...v,
            nameKa: v.nameKa.trim(),
            nameEn: v.nameEn?.trim() || null,
          })),
        );
        return { specs: next };
      }
      return {};
    })();
    const payload = {
      ...fields,
      ...studio,
      categoryId: Number(form.categoryId),
      pricePerUnit: Number(form.pricePerUnit),
      storeId: form.storeId ? Number(form.storeId) : null,
      model3dKind: form.model3dKind || null,
      model3dUrl: form.model3dUrl || null,
      // Blank dimensions mean "use the archetype's default", not zero.
      widthCm: form.widthCm ? Number(form.widthCm) : null,
      depthCm: form.depthCm ? Number(form.depthCm) : null,
      heightCm: form.heightCm ? Number(form.heightCm) : null,
      styleTags: form.styleTags.length > 0 ? form.styleTags : null,
    };
    const url = product ? `/api/products/${product.id}` : "/api/products";
    const method = product ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push(rememberedListHref(backHref));
    router.refresh();
  };

  const remove = async () => {
    if (!product) return;
    if (!confirm(ka.admin.forms.confirms.deleteProduct)) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "DELETE",
    });
    setLoading(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({ error: null }))) as {
        error: string | null;
      };
      setError(apiErrorMessage(ka, json.error));
      return;
    }
    router.push(rememberedListHref(backHref));
    router.refresh();
  };

  // The styles a product suits and its colour, for every kind the studio makes of it.
  const styleTagsField = (
    <div className="space-y-2">
      <Label>{ka.admin.forms.styleTags}</Label>
      <div className="flex flex-wrap gap-2">
        {STYLE_IDS.map((id) => {
          const active = form.styleTags.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                update(
                  "styleTags",
                  active
                    ? form.styleTags.filter((s) => s !== id)
                    : [...form.styleTags, id],
                )
              }
              className={
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors " +
                (active
                  ? "border-brand bg-brand/10 text-brand-dark"
                  : "border-line bg-bg-surface text-ink-muted hover:border-brand/40")
              }
            >
              <span
                className="h-3 w-3 rounded-full border border-line"
                style={{ backgroundColor: STYLES[id].swatches[0] }}
              />
              {id}
            </button>
          );
        })}
      </div>
    </div>
  );
  const colorField = (
    <div className="space-y-2">
      <Label>{ka.admin.forms.colorHex}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          value={form.colorHex || DEFAULT_COLOR}
          onChange={(e) => update("colorHex", e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-md border border-line bg-bg-surface"
          aria-label={ka.admin.forms.colorHex}
        />
        <Input
          value={form.colorHex ?? ""}
          onChange={(e) => update("colorHex", e.target.value)}
          placeholder={DEFAULT_COLOR}
        />
      </div>
    </div>
  );

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="product-name">{ka.admin.table.name}</Label>
              <Input
                id="product-name"
                required
                value={form.nameKa}
                onChange={(e) => changeName(e.target.value)}
              />
            </div>
            <fieldset className="space-y-3 rounded-md border border-line p-4 md:col-span-2">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {ka.admin.forms.translations}
              </legend>
              <p className="text-xs text-ink-muted">
                {ka.admin.forms.translationsHint}
              </p>
              {/* Russian is hidden here for now: what is stored is kept and sent back untouched, and
                  the site falls back to English, then Georgian (docs/catalog.md). */}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>{ka.admin.forms.nameEn}</Label>
                  <Input
                    value={form.nameEn}
                    onChange={(e) => update("nameEn", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{ka.admin.forms.descriptionEn}</Label>
                  <Textarea
                    rows={2}
                    value={form.descriptionEn ?? ""}
                    onChange={(e) => update("descriptionEn", e.target.value)}
                  />
                </div>
              </div>
            </fieldset>
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <Label htmlFor="product-slug">{ka.admin.forms.slug}</Label>
                {slugFromName && form.slug !== slugFromName && (
                  <button
                    type="button"
                    onClick={() => {
                      update("slug", slugFromName);
                      setSlugTyped(false);
                      if (!product) setSlugFollows(true);
                    }}
                    className="bracket-link text-xs text-ink-soft hover:text-brand"
                  >
                    {ka.admin.forms.slugFromName}
                  </button>
                )}
              </div>
              <Input
                id="product-slug"
                required
                value={form.slug}
                onChange={(e) => {
                  setSlugFollows(false);
                  setSlugTyped(true);
                  update("slug", e.target.value);
                }}
                onBlur={tidySlug}
                autoCapitalize="none"
                spellCheck={false}
              />
              <p className="text-xs text-ink-muted">
                {product
                  ? ka.admin.forms.slugHintEdit
                  : ka.admin.forms.slugHintNew}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.sku}</Label>
              <Input
                value={form.sku ?? ""}
                onChange={(e) => update("sku", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">
                {ka.admin.table.category}
              </Label>
              <Combobox
                id="product-category"
                value={form.categoryId}
                options={categoryOptions}
                placeholder={ka.admin.forms.chooseCategory}
                onValueChange={(v) => {
                  // A category that takes a 3D kind gives it to a product that has none yet.
                  const kind = categories.find(
                    (c) => String(c.id) === v,
                  )?.model3dKind;
                  setForm((f) => ({
                    ...f,
                    categoryId: v,
                    ...(kind && !f.model3dKind ? { model3dKind: kind } : {}),
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-store">{ka.admin.forms.store}</Label>
              {partner ? (
                <Input
                  id="product-store"
                  value={
                    stores.find((s) => s.id === partner.storeId)?.nameKa ?? ""
                  }
                  disabled
                />
              ) : (
                <Combobox
                  id="product-store"
                  value={form.storeId || "none"}
                  options={storeOptions}
                  onValueChange={(v) =>
                    update("storeId", v === "none" ? "" : v)
                  }
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.unit}</Label>
              <Select
                value={form.unit}
                onValueChange={(v) => update("unit", v as typeof form.unit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNIT_KEYS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabel(ka, u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.table.price} (GEL)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.pricePerUnit}
                onChange={(e) => update("pricePerUnit", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{ka.admin.forms.brand}</Label>
              <Input
                value={form.brand ?? ""}
                onChange={(e) => update("brand", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.photo}</Label>
              <ImageUploader
                value={form.imageUrl ?? ""}
                onChange={(url) => update("imageUrl", url)}
                folder="products"
                helperText={ka.admin.forms.photoHelperProduct}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>{ka.admin.forms.description}</Label>
              <Textarea
                rows={4}
                value={form.descriptionKa ?? ""}
                onChange={(e) => update("descriptionKa", e.target.value)}
              />
            </div>
          </div>

          <section className="space-y-4 rounded-lg border border-line bg-bg-base/40 p-4">
            <div>
              <h2 className="font-serif text-lg font-semibold">
                {kind === "finish"
                  ? ka.admin.forms.finishSection
                  : kind === "trim"
                    ? ka.admin.forms.trimSection
                    : ka.admin.forms.designSection}
              </h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {kind === "finish"
                  ? ka.admin.forms.finishHelper
                  : kind === "trim"
                    ? ka.admin.forms.trimHelper
                    : ka.admin.forms.designHelper}
              </p>
            </div>

            {styleTagsField}

            {kind === "finish" && (
              <>
                <div className="space-y-2">
                  <Label>{ka.admin.forms.texture}</Label>
                  <ImageUploader
                    value={form.textureUrl}
                    // A texture typed in or removed has no colours read off it yet.
                    onChange={(url) =>
                      setForm((f) => ({
                        ...f,
                        textureUrl: url,
                        colors: url ? f.colors : [],
                      }))
                    }
                    onUploaded={({ url, colors }) =>
                      setForm((f) => ({
                        ...f,
                        colors: colors ?? [],
                        // The texture is the photo too, unless there is one; its main colour is
                        // what shows until it loads, unless one was chosen.
                        imageUrl: f.imageUrl || url,
                        colorHex:
                          colors?.[0] &&
                          (!f.colorHex || f.colorHex === DEFAULT_COLOR)
                            ? colors[0]
                            : f.colorHex,
                      }))
                    }
                    folder="textures"
                    helperText={ka.admin.forms.textureHelper}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-[auto_1fr]">
                  {/* The texture as the studio lays it: two metres by two, at the repeat size given. */}
                  <div
                    className="relative shrink-0 overflow-hidden rounded-md border border-line bg-bg-base"
                    style={{
                      width: PREVIEW_PX,
                      height: PREVIEW_PX,
                      ...(form.textureUrl
                        ? {
                            backgroundImage: `url("${form.textureUrl}")`,
                            backgroundRepeat: "repeat",
                            backgroundSize: `${Math.max(8, Math.round(((Number(form.textureScaleM) || 1.5) / PREVIEW_M) * PREVIEW_PX))}px`,
                          }
                        : {}),
                    }}
                  >
                    <span className="absolute bottom-1 left-1 rounded-sm bg-white/90 px-1 text-[10px] font-semibold text-ink">
                      {ka.design.finishPreviewSize}
                    </span>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{ka.admin.forms.finishSurfaces}</Label>
                      <div className="flex flex-wrap gap-2">
                        {(["floor", "wall"] as const).map((surface) => {
                          const active = form.surfaces.includes(surface);
                          return (
                            <button
                              key={surface}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                update(
                                  "surfaces",
                                  active
                                    ? form.surfaces.filter((s) => s !== surface)
                                    : [...form.surfaces, surface],
                                )
                              }
                              className={
                                "rounded-md border px-3 py-1.5 text-sm transition-colors " +
                                (active
                                  ? "border-brand bg-brand/10 text-brand-dark"
                                  : "border-line bg-bg-surface text-ink-muted hover:border-brand/40")
                              }
                            >
                              {surface === "floor"
                                ? ka.design.finishFloor
                                : ka.design.finishWall}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.wet}
                        onChange={(e) => update("wet", e.target.checked)}
                      />
                      {ka.admin.forms.finishWet}
                    </label>
                    <div className="space-y-1">
                      <Label>{ka.admin.forms.textureColors}</Label>
                      {form.colors.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {form.colors.map((hex) => {
                            const family = colorFamily(hex);
                            return (
                              <span
                                key={hex}
                                className="flex items-center gap-1.5 text-xs text-ink-soft"
                              >
                                <span
                                  className="h-4 w-4 rounded-full border border-black/15"
                                  style={{ backgroundColor: hex }}
                                />
                                {family
                                  ? ((
                                      ka.design.colorNames as Record<
                                        string,
                                        string
                                      >
                                    )[family] ?? family)
                                  : hex}
                                {family && (
                                  <span
                                    className="h-2 w-2 rounded-full border border-black/15"
                                    style={{
                                      backgroundColor: COLOR_FAMILIES.find(
                                        (c) => c.id === family,
                                      )?.hex,
                                    }}
                                    aria-hidden
                                  />
                                )}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          {ka.admin.forms.textureColorsNone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{ka.admin.forms.textureScale}</Label>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="20"
                      value={form.textureScaleM}
                      onChange={(e) => update("textureScaleM", e.target.value)}
                      placeholder="1.5"
                    />
                    <p className="text-xs text-ink-muted">
                      {ka.admin.forms.textureScaleHelper}
                    </p>
                  </div>
                  {form.unit !== "m2" && (
                    <div className="space-y-2">
                      <Label>{ka.admin.forms.coverage}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={form.coveragePerUnit}
                        onChange={(e) =>
                          update("coveragePerUnit", e.target.value)
                        }
                        placeholder={form.unit === "liter" ? "8" : "1"}
                      />
                      <p className="text-xs text-ink-muted">
                        {ka.admin.forms.coverageHelper}
                      </p>
                    </div>
                  )}
                  {colorField}
                </div>
              </>
            )}

            {kind === "trim" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{ka.admin.forms.trimProfile}</Label>
                  <Select
                    value={form.profile || "default"}
                    onValueChange={(v) =>
                      update(
                        "profile",
                        v === "default" ? "" : (v as TrimProfile),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">—</SelectItem>
                      {TRIM_PROFILES.map((profile) => (
                        <SelectItem key={profile} value={profile}>
                          {(ka.design.trimProfiles as Record<string, string>)[
                            profile
                          ] ?? profile}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {colorField}
                <div className="space-y-2">
                  <Label>{ka.admin.forms.trimHeightCm}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="100"
                    value={form.trimHeightCm}
                    onChange={(e) => update("trimHeightCm", e.target.value)}
                    placeholder="8"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{ka.admin.forms.trimDepthCm}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.2"
                    max="100"
                    value={form.trimDepthCm}
                    onChange={(e) => update("trimDepthCm", e.target.value)}
                    placeholder="1.6"
                  />
                </div>
              </div>
            )}

            {kind === "model" && (
              <>
                <div className="space-y-2">
                  <Label>{ka.admin.forms.model3d}</Label>
                  <ModelUploader
                    value={form.model3dUrl}
                    onChange={(url) => update("model3dUrl", url)}
                    onMaterials={setModelMaterials}
                    look={previewLook}
                    controlRef={modelControl}
                    onMeasured={applyMeasurement}
                    onSnapshot={(url) =>
                      setForm((f) => (f.imageUrl ? f : { ...f, imageUrl: url }))
                    }
                    helperText={ka.admin.forms.model3dHelper}
                  />
                </div>

                {/* Under the turntable, so the variant being edited is seen on the model as it changes. */}
                {form.model3dUrl && (
                  <VariantsEditor
                    variants={variants}
                    onChange={setVariants}
                    modelUrl={form.model3dUrl}
                    materials={modelMaterials}
                    basePrice={Number(form.pricePerUnit) || 0}
                    previewId={previewVariantId}
                    onPreview={setPreviewVariantId}
                    onPhoto={async () => modelControl.current?.photo() ?? null}
                  />
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="product-kind">
                      {ka.admin.forms.model3dKind}
                    </Label>
                    <Combobox
                      id="product-kind"
                      value={form.model3dKind || "none"}
                      options={kindChoices}
                      onValueChange={chooseModelKind}
                    />
                  </div>

                  {colorField}
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {(
                    [
                      ["widthCm", ka.admin.forms.widthCm],
                      ["depthCm", ka.admin.forms.depthCm],
                      ["heightCm", ka.admin.forms.heightCm],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Input
                        type="number"
                        min="1"
                        max="2000"
                        value={form[key]}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => update("isActive", e.target.checked)}
              />
              {ka.admin.forms.active}
            </label>
            {!partner && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isFeatured}
                  onChange={(e) => update("isFeatured", e.target.checked)}
                />
                {ka.admin.forms.featured}
              </label>
            )}
          </div>

          {error && (
            <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex justify-between">
            <div>
              {product && canDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={remove}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" /> {ka.admin.actions.delete}
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {ka.admin.actions.save}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
