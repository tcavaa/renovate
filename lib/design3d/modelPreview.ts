'use client';

/**
 * A product's GLB on a turntable, for the catalogue's "see in 3D" drawer.
 *
 * Plain three.js mounted into a host element and loaded on demand, so the catalogue page
 * carries none of the studio's bundle until someone asks for the model. The model is shown
 * with its own materials at whatever size it was authored; it is only normalised to about
 * a metre so the lights, the grid and the camera can stay fixed.
 */

export interface ModelPreviewHandle {
  dispose: () => void;
}

export async function mountModelPreview(host: HTMLElement, url: string): Promise<ModelPreviewHandle> {
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
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (!child.geometry.attributes.normal) child.geometry.computeVertexNormals();
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  // Normalise to roughly a metre so lights, grid and camera can be fixed.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longest = Math.max(size.x, size.y, size.z, 1e-6);
  model.scale.setScalar(1 / longest);
  const scaledBox = new THREE.Box3().setFromObject(model);
  const centre = scaledBox.getCenter(new THREE.Vector3());
  model.position.set(-centre.x, -scaledBox.min.y, -centre.z);
  const height = scaledBox.max.y - scaledBox.min.y;

  const width = host.clientWidth || 480;
  const heightPx = host.clientHeight || 360;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, heightPx);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, width / heightPx, 0.01, 50);
  camera.position.set(1.7, 1.15, 2.0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, height / 2, 0);
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.1;
  controls.minDistance = 0.6;
  controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  // The first drag takes over from the turntable.
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 3, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xfff3dc, 0.5);
  fill.position.set(-2, 1.5, -1);
  scene.add(fill);

  const grid = new THREE.GridHelper(2, 8, 0xb0a99c, 0xd6d0c6);
  scene.add(grid);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
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
    const h = host.clientHeight || heightPx;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(onResize);
  observer.observe(host);

  return {
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
      floor.geometry.dispose();
      grid.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
