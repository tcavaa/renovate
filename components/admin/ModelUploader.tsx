'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Camera, Loader2, Ruler, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { fill } from '@/lib/admin/list';
import { cn } from '@/lib/utils';

/**
 * Upload a furniture GLB for the studio and see it before saving.
 *
 * The file goes to `/api/upload/model` (bytes checked server-side), the returned URL becomes
 * `products.model3dUrl`, and the same URL is then loaded here with the studio's own loader —
 * so what the preview shows is exactly what a room will get. From the geometry the uploader
 * reads the real size (cm) to prefill the product's dimensions, counts triangles and
 * textures, and can render a PNG of the model to use as the product photo.
 *
 * Convention shown, not enforced: Y up, metres, front along +Z (the arrow on the floor). A
 * model in centimetres or millimetres is recognised by its size and the dimensions are
 * converted; the studio scales every model to the product's dimensions anyway.
 */
export interface ModelMeasurement {
  widthCm: number;
  depthCm: number;
  heightCm: number;
  triangles: number;
  meshes: number;
  textures: number;
  /** What the geometry's units appear to be. */
  units: 'm' | 'cm' | 'mm';
  /**
   * Longest side exactly one unit: the file was normalised (this project's own converter and
   * the stock pipeline both do it) and its size says nothing about the real product.
   */
  normalised: boolean;
}

interface Props {
  value: string;
  onChange: (url: string) => void;
  /** Called after every successful load (`auto: true`) and when admin presses "apply". */
  onMeasured?: (m: ModelMeasurement, opts: { auto: boolean }) => void;
  /** A PNG rendered from the preview, already uploaded; the caller decides whether to use it. */
  onSnapshot?: (url: string) => void;
  helperText?: string;
}

const MAX_MB = 40;
const HEAVY_TRIANGLES = 400_000;

type PreviewHandle = {
  dispose: () => void;
  snapshot: () => Promise<Blob | null>;
};

export function ModelUploader({ value, onChange, onMeasured, onSnapshot, helperText }: Props) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<PreviewHandle | null>(null);
  // The latest callback, read from the async load without re-mounting the preview when the
  // parent re-renders with a new function identity.
  const onMeasuredRef = useRef(onMeasured);
  useEffect(() => {
    onMeasuredRef.current = onMeasured;
  });

  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** What the preview knows about the URL it last tried; derived flags below key on the URL. */
  const [result, setResult] = useState<{ url: string; measured: ModelMeasurement | null; error: boolean } | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // A URL typed by hand arrives one character at a time; wait for the typing to stop before
  // trying to load it. An upload sets the whole URL at once and only pays the same delay.
  const [previewUrl, setPreviewUrl] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewUrl(value.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [value]);

  const loading = !!previewUrl && result?.url !== previewUrl;
  const loadError = !!previewUrl && result?.url === previewUrl && result.error;
  const measured = previewUrl && result?.url === previewUrl && !result.error ? result.measured : null;

  // Load and show whatever URL is set — the one just uploaded or the one already saved.
  useEffect(() => {
    const host = hostRef.current;
    if (!previewUrl || !host) return;
    let cancelled = false;
    mountPreview(host, previewUrl)
      .then(({ handle, measurement }) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        previewRef.current = handle;
        setResult({ url: previewUrl, measured: measurement, error: false });
        // A normalised file has no size of its own; only an explicit "apply" uses it.
        if (!measurement.normalised) onMeasuredRef.current?.(measurement, { auto: true });
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setResult({ url: previewUrl, measured: null, error: true });
      });
    return () => {
      cancelled = true;
      previewRef.current?.dispose();
      previewRef.current = null;
    };
  }, [previewUrl]);

  const upload = (file: File) => {
    setError(null);
    setNotice(null);
    if (!/\.glb$/i.test(file.name) && file.type !== 'model/gltf-binary') {
      setError(t.modelUploader.invalidFile);
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(fill(t.modelUploader.tooLarge, { mb: MAX_MB }));
      return;
    }
    setProgress(0);
    const body = new FormData();
    body.append('file', file);
    // XMLHttpRequest for the progress events fetch() does not have — a 30 MB GLB on a slow
    // line is a long silence otherwise.
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/model');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      try {
        const json = JSON.parse(xhr.responseText) as { data: { url: string; size: number } | null; error: string | null };
        if (xhr.status >= 400 || !json.data) {
          setError(json.error ?? t.modelUploader.uploadError);
          return;
        }
        setBytes(json.data.size);
        onChange(json.data.url);
      } catch {
        setError(t.modelUploader.uploadError);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError(t.modelUploader.uploadError);
    };
    xhr.send(body);
    if (inputRef.current) inputRef.current.value = '';
  };

  const snapshot = async () => {
    if (!previewRef.current || !onSnapshot) return;
    setSnapshotting(true);
    setNotice(null);
    try {
      const blob = await previewRef.current.snapshot();
      if (!blob) throw new Error('no snapshot');
      const body = new FormData();
      body.append('file', new File([blob], 'model.png', { type: 'image/png' }));
      body.append('folder', 'products');
      const res = await fetch('/api/upload', { method: 'POST', body });
      const json = (await res.json()) as { data: { url: string } | null; error: string | null };
      if (!res.ok || !json.data) throw new Error(json.error ?? 'upload');
      onSnapshot(json.data.url);
      setNotice(t.modelUploader.snapshotDone);
    } catch (e) {
      console.error(e);
      setError(t.modelUploader.uploadError);
    } finally {
      setSnapshotting(false);
    }
  };

  const uploading = progress != null;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? fill(t.modelUploader.uploading, { pct: progress }) : t.modelUploader.upload}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')} disabled={uploading}>
                <X className="h-4 w-4" />
                {t.modelUploader.remove}
              </Button>
            )}
            {value && onSnapshot && (
              <Button type="button" variant="ghost" size="sm" onClick={snapshot} disabled={snapshotting || loading || loadError || !measured}>
                {snapshotting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {t.modelUploader.snapshot}
              </Button>
            )}
          </div>
          {uploading && (
            <div className="h-1 w-full bg-line/60">
              <div className="h-1 bg-ink transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
          <Input placeholder={t.modelUploader.urlPlaceholder} value={value} onChange={(e) => onChange(e.target.value)} disabled={uploading} />
          {helperText && <p className="text-xs text-ink-muted">{helperText}</p>}

          {measured && (
            <div className="space-y-2 border border-line bg-bg-surface p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-ink">
                  <Ruler className="h-3.5 w-3.5 text-ink-muted" />
                  {t.modelUploader.measured}:{' '}
                  <span className="font-semibold tabular-nums">
                    {measured.widthCm} × {measured.depthCm} × {measured.heightCm} {t.units.cm}
                  </span>
                </span>
                {onMeasured && (
                  <button type="button" onClick={() => onMeasured(measured, { auto: false })} className="border border-line px-2 py-1 font-medium text-ink hover:border-ink">
                    {t.modelUploader.applyDims}
                  </button>
                )}
              </div>
              <p className="flex flex-wrap gap-x-3 text-ink-muted">
                <span>{fill(t.modelUploader.triangles, { n: measured.triangles.toLocaleString('en-US') })}</span>
                <span>{fill(t.modelUploader.meshes, { n: measured.meshes })}</span>
                <span>{fill(t.modelUploader.textures, { n: measured.textures })}</span>
                {bytes != null && <span>{fill(t.modelUploader.fileSize, { mb: (bytes / 1024 / 1024).toFixed(1) })}</span>}
              </p>
              {measured.normalised && <p className="text-warning">{t.modelUploader.normalised}</p>}
              {!measured.normalised && measured.units !== 'm' && <p className="text-warning">{measured.units === 'cm' ? t.modelUploader.unitsCm : t.modelUploader.unitsMm}</p>}
              {measured.textures === 0 && <p className="text-warning">{t.modelUploader.noTextures}</p>}
              {measured.triangles > HEAVY_TRIANGLES && <p className="text-warning">{t.modelUploader.heavy}</p>}
            </div>
          )}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden border border-line bg-[#EEEBE4]">
          <div ref={hostRef} className="absolute inset-0" />
          {!value && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-muted">
              <Box className="h-8 w-8" />
              <span className="text-xs">{t.modelUploader.noModel}</span>
            </div>
          )}
          {value && loading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-[#EEEBE4]/70 text-xs text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t.modelUploader.loading}
            </div>
          )}
          {value && loadError && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-danger">{t.modelUploader.loadError}</div>}
          {value && !loading && !loadError && <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-white/70 px-2 py-1 text-[10px] text-ink-muted">{t.modelUploader.previewHint}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />

      {notice && <p className={cn('text-sm text-success')}>{notice}</p>}
      {error && <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview: plain three.js, loaded on demand so the admin bundle stays light
// ---------------------------------------------------------------------------

async function mountPreview(host: HTMLElement, url: string): Promise<{ handle: PreviewHandle; measurement: ModelMeasurement }> {
  const [THREE, { GLTFLoader }, { OrbitControls }, { MeshoptDecoder }] = await Promise.all([
    import('three'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
  ]);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene;

  // Measure in the file's own units, then decide what those units are.
  let triangles = 0;
  let meshes = 0;
  const textures = new Set<string>();
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      meshes++;
      const geo = child.geometry as InstanceType<typeof THREE.BufferGeometry>;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      triangles += Math.floor((geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'] as const) {
          const tex = (m as unknown as Record<string, { uuid: string } | null>)[key];
          if (tex) textures.add(tex.uuid);
        }
      }
    }
  });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z);
  const units: ModelMeasurement['units'] = longest > 2000 ? 'mm' : longest > 50 ? 'cm' : 'm';
  const toCm = units === 'm' ? 100 : units === 'cm' ? 1 : 0.1;
  const normalised = Math.abs(longest - 1) < 0.005;
  const measurement: ModelMeasurement = {
    widthCm: Math.max(1, Math.round(size.x * toCm)),
    depthCm: Math.max(1, Math.round(size.z * toCm)),
    heightCm: Math.max(1, Math.round(size.y * toCm)),
    triangles,
    meshes,
    textures: textures.size,
    units,
    normalised,
  };

  // Normalise to roughly a metre so lights, grid and camera can be fixed.
  const scale = 1 / Math.max(longest, 1e-6);
  model.scale.setScalar(scale);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const centre = scaledBox.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -scaledBox.min.y, -centre.z);

  const width = host.clientWidth || 320;
  const height = host.clientHeight || 240;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 50);
  camera.position.set(1.6, 1.1, 1.9);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.4, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.minDistance = 0.6;
  controls.maxDistance = 6;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 3, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const helpers = new THREE.Group();
  const grid = new THREE.GridHelper(2, 8, 0xb0a99c, 0xd6d0c6);
  helpers.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  helpers.add(floor);
  // The studio assumes the front of a piece faces +Z; this arrow says which way that is.
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0.01, scaledBox.max.z - centre.z + 0.05), 0.35, 0xc2410c, 0.12, 0.08);
  helpers.add(arrow);
  scene.add(helpers);

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  scene.add(model);

  let frame = 0;
  let disposed = false;
  const tick = () => {
    if (disposed) return;
    controls.update();
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  tick();

  const onResize = () => {
    const w = host.clientWidth || width;
    const h = host.clientHeight || height;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(host);

  const handle: PreviewHandle = {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          for (const m of mats) {
            for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
              const tex = (m as unknown as Record<string, { dispose?: () => void } | null>)[key];
              tex?.dispose?.();
            }
            m.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
    snapshot() {
      // A clean product shot: no grid, no arrow, transparent background, a fixed three-quarter view.
      helpers.visible = false;
      const saved = { pos: camera.position.clone(), target: controls.target.clone(), auto: controls.autoRotate };
      controls.autoRotate = false;
      camera.position.set(1.5, 1.0, 1.9);
      controls.target.set(0, (scaledBox.max.y - scaledBox.min.y) / 2, 0);
      controls.update();
      renderer.render(scene, camera);
      return new Promise<Blob | null>((resolve) => {
        renderer.domElement.toBlob((blob) => {
          helpers.visible = true;
          camera.position.copy(saved.pos);
          controls.target.copy(saved.target);
          controls.autoRotate = saved.auto;
          controls.update();
          resolve(blob);
        }, 'image/png');
      });
    },
  };
  return { handle, measurement };
}
