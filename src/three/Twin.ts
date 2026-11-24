import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BRIDGE_FLOOR, FIRST_RES_FLOOR, TOP_FLOOR, type TowerId, type Unit } from '../data/units';

/**
 * Digital twin of Macororó 16 | 17 at real scale (1 unit = 1 m), modelled from the drone footage:
 * two rounded-rectangle towers with undulating white balcony slabs over recessed dark glazing,
 * a glazed skybridge, a banded podium with a rooftop pool, physically based sky + sun,
 * ambient occlusion, and a dollhouse cutaway that opens any floor.
 */

const FH = 3.05; // floor-to-floor height
const PODIUM_LEVELS = 5;
const PODIUM_H = 4.2;
const PODIUM_TOP = PODIUM_LEVELS * PODIUM_H;
const N = 192; // perimeter samples per floor
const HALF = { x: 12.5, z: 8.2 };
const TOWER_POS: Record<TowerId, [number, number]> = { '16': [-19.5, 1.5], '17': [19.5, -2.5] };

export const floorY = (floor: number) => PODIUM_TOP + (floor - FIRST_RES_FLOOR) * FH;

// rounded-rectangle (superellipse) plate outline, local to the tower centre
function plate(scale = 1, grow = 0): [number, number][] {
  const out: [number, number][] = [];
  const n = 4.2;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = Math.sign(c) * (HALF.x * scale + grow) * Math.pow(Math.abs(c), 2 / n);
    const z = Math.sign(s) * (HALF.z * scale + grow) * Math.pow(Math.abs(s), 2 / n);
    out.push([x, z]);
  }
  return out;
}

function normals(pts: [number, number][]) {
  return pts.map((_, i) => {
    const [ax, az] = pts[(i - 1 + pts.length) % pts.length];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const nx = bz - az;
    const nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1;
    return [nx / l, nz / l] as [number, number];
  });
}

const CORE = plate(1);
const CORE_N = normals(CORE);

/** Balcony slab edge for a tower floor: waves travel around the plate and drift floor to floor. */
function slabEdge(tower: TowerId, floor: number): [number, number][] {
  const ph = floor * 0.42 + (tower === '17' ? 1.9 : 0);
  // gentle silhouette swell (towers read slightly wider mid-height and at the crown)
  const swell = 0.5 * Math.sin(((floor - FIRST_RES_FLOOR) / (TOP_FLOOR - FIRST_RES_FLOOR)) * Math.PI * 1.15);
  return CORE.map(([x, z], i) => {
    const t = (i / N) * Math.PI * 2;
    const d = 0.55 + swell + 1.55 * (0.5 + 0.5 * Math.sin(t * 4 + ph));
    const [nx, nz] = CORE_N[i];
    return [x + nx * d, z + nz * d];
  });
}

function podiumOutline(level: number): [number, number][] {
  const out: [number, number][] = [];
  const a = 43 - level * 0.6;
  const b = 17.5 - level * 0.3;
  const n = 3.2;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    out.push([Math.sign(c) * a * Math.pow(Math.abs(c), 2 / n), Math.sign(s) * b * Math.pow(Math.abs(s), 2 / n) + 1]);
  }
  return out;
}

function shape(pts: [number, number][], ox = 0, oz = 0) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x + ox, -(z + oz)) : s.moveTo(x + ox, -(z + oz))));
  s.closePath();
  return s;
}

function slab(pts: [number, number][], y: number, depth: number, ox = 0, oz = 0) {
  const g = new THREE.ExtrudeGeometry(shape(pts, ox, oz), { depth, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g.toNonIndexed();
}

/** vertical ring of quads (non-indexed) with optional uv along the perimeter */
function ring(pts: [number, number][], y0: number, h: number, ox: number, oz: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const nx = bz - az;
    const nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1;
    const u0 = i / pts.length;
    const u1 = (i + 1) / pts.length;
    const q: [number, number, number, number, number][] = [
      [ax, y0, az, u0, 0], [bx, y0, bz, u1, 0], [bx, y0 + h, bz, u1, 1],
      [ax, y0, az, u0, 0], [bx, y0 + h, bz, u1, 1], [ax, y0 + h, az, u0, 1],
    ];
    for (const [x, y, z, u, v] of q) {
      pos.push(x + ox, y, z + oz);
      nor.push(nx / l, 0, nz / l);
      uv.push(u * 40, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** Mullion texture so the dark glazing reads as framed curtain wall */
function mullionTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, '#2c3a47');
  grd.addColorStop(1, '#101820');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = 'rgba(210,220,228,.55)';
  for (let x = 0; x < 256; x += 64) g.fillRect(x, 0, 3, 64);
  g.fillRect(0, 40, 256, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

type Hl = { tower: TowerId; floor: number } | null;

export type PickHandler = (u: Unit | null) => void;
export type HoverHandler = (u: Unit | null, x: number, y: number) => void;

type TowerParts = {
  glass: THREE.Mesh;
  slab: THREE.Mesh;
  rail: THREE.Mesh;
  faceUnit: Int32Array;
  vertUnit: Int32Array;
  vertTint: Float32Array;
  clip: THREE.Plane;
};

export class Twin {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private container: HTMLElement;
  private ro: ResizeObserver;
  private raf = 0;
  private clock = new THREE.Clock();

  private sky = new Sky();
  private sun = new THREE.DirectionalLight('#ffffff', 3);
  private hemi = new THREE.HemisphereLight('#dfeaff', '#6b6152', 0.6);
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private skyScene = new THREE.Scene();

  private units: Unit[];
  private towers = {} as Record<TowerId, TowerParts>;
  private glassMats: THREE.MeshPhysicalMaterial[] = [];
  private colorFn: (u: Unit) => string | null = () => null;
  private selectedId: string | null = null;
  private hl: Hl = null;
  private hlRing: THREE.LineLoop;
  private hoverIdx = -1;
  private glow = 0;
  hour = 12.5;

  private doll = new THREE.Group();
  private dollFor: { tower: TowerId; floor: number } | null = null;
  private dollFills = new Map<string, THREE.Mesh>();

  private raycaster = new THREE.Raycaster();
  private ptr = new THREE.Vector2();
  private down = { x: 0, y: 0, t: 0 };
  private pickCb: PickHandler = () => {};
  private hoverCb: HoverHandler = () => {};
  private fly: { a: THREE.Vector3; b: THREE.Vector3; ta: THREE.Vector3; tb: THREE.Vector3; t: number; d: number } | null = null;
  private offset = { x: 0, y: 0 };

  constructor(container: HTMLElement, units: Unit[]) {
    this.container = container;
    this.units = units;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.62;
    this.renderer.localClippingEnabled = true;
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { display: 'block', touchAction: 'none' });

    this.camera = new THREE.PerspectiveCamera(32, w / h, 1, 6000);
    this.camera.position.set(150, 85, 205).multiplyScalar(THREE.MathUtils.clamp(1.3 / (w / h), 1, 2.6));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 58, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 520;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.autoRotateSpeed = 0.35;
    this.controls.addEventListener('start', () => (this.fly = null));

    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    // sky
    this.sky.scale.setScalar(4500);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.4;
    u.rayleigh.value = 2.1;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);
    this.skyScene.add(new Sky());
    this.scene.fog = new THREE.Fog('#c9d6e2', 700, 3200);

    this.sun.castShadow = true;
    const lowPower = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;
    this.sun.shadow.mapSize.set(lowPower ? 2048 : 4096, lowPower ? 2048 : 4096);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 140; sc.bottom = -60; sc.near = 10; sc.far = 700;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.buildGround();
    this.buildCity();
    this.buildPodium();
    (['16', '17'] as TowerId[]).forEach((t) => (this.towers[t] = this.buildTower(t)));
    this.buildBridge();
    this.scene.add(this.doll);

    this.hlRing = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#2BE35A', depthTest: false, transparent: true }));
    this.hlRing.renderOrder = 20;
    this.hlRing.visible = false;
    this.scene.add(this.hlRing);

    // post: AO gives the facade its depth
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.gtao = new GTAOPass(this.scene, this.camera, w, h);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 2.2, distanceExponent: 1.6, thickness: 2, scale: 1.2, samples: 12 });
    if (!lowPower && !/ao=0/.test(window.location.hash)) this.composer.addPass(this.gtao);
    this.composer.addPass(new OutputPass());

    this.setHour(this.hour);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointerleave', () => this.setHover(-1, 0, 0));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.loop();
  }

  // ------------------------------------------------------------------ build
  private buildGround() {
    // ground with procedural asphalt/grass/paving texture
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    g.fillStyle = '#66704f';
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(${60 + Math.random() * 60},${80 + Math.random() * 60},${50 + Math.random() * 40},.25)`;
      g.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(2600, 64), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const asphalt = new THREE.MeshStandardMaterial({ color: '#3a3c3f', roughness: 0.95 });
    const walk = new THREE.MeshStandardMaterial({ color: '#c9c4ba', roughness: 0.95 });
    const road = (w: number, l: number, x: number, z: number, r: number, mat = asphalt, y = 0.05) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
      m.rotation.set(-Math.PI / 2, 0, r);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    // site plaza + streets around the block (Av. Beni in front)
    road(120, 64, 0, 2, 0, walk, 0.04);
    road(2400, 18, 0, 46, Math.PI / 2, asphalt);
    road(2400, 10, 0, -44, Math.PI / 2, asphalt);
    road(12, 2400, -78, 0, 0, asphalt);
    road(12, 2400, 82, 0, 0, asphalt);
    // grid of secondary streets
    for (let k = -12; k <= 12; k++) {
      if (Math.abs(k) < 2) continue;
      road(2400, 8, 0, k * 95 + 46, Math.PI / 2, asphalt, 0.03);
      road(8, 2400, k * 110 + 82, 0, 0, asphalt, 0.03);
    }
  }

  private buildCity() {
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const wallMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const houses = new THREE.InstancedMesh(box, wallMat, 1400);
    const roofGeo = new THREE.ConeGeometry(0.75, 0.5, 4, 1).rotateY(Math.PI / 4).translate(0, 0.25, 0);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ color: '#b5603f', roughness: 0.9 }), 1400);
    const towersM = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#e8e5df', roughness: 0.6, metalness: 0.05 }), 120);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    let nh = 0;
    let nt = 0;
    for (let bx = -12; bx <= 12; bx++) {
      for (let bz = -12; bz <= 12; bz++) {
        const cx = bx * 110 + 82 + 55;
        const cz = bz * 95 + 46 + 47;
        if (Math.abs(cx) < 140 && Math.abs(cz) < 110) continue; // keep the site clear
        const dist = Math.hypot(cx, cz);
        if (dist > 1300) continue;
        if (rnd() < 0.12 && nt < 120 && dist < 900) {
          const hgt = 25 + rnd() * 55;
          m.compose(new THREE.Vector3(cx, 0, cz), q, new THREE.Vector3(18 + rnd() * 10, hgt, 16 + rnd() * 10));
          towersM.setMatrixAt(nt++, m);
          continue;
        }
        for (let k = 0; k < 6 && nh < 1400; k++) {
          const x = cx + (rnd() - 0.5) * 80;
          const z = cz + (rnd() - 0.5) * 70;
          const w = 9 + rnd() * 9;
          const d = 9 + rnd() * 9;
          const hh = 3.5 + rnd() * 4;
          const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() - 0.5) * 0.1);
          m.compose(new THREE.Vector3(x, 0, z), rot, new THREE.Vector3(w, hh, d));
          houses.setMatrixAt(nh, m);
          houses.setColorAt(nh, col.set(rnd() < 0.5 ? '#efe9de' : rnd() < 0.5 ? '#e4d3bd' : '#d9dcd6'));
          m.compose(new THREE.Vector3(x, hh, z), rot, new THREE.Vector3(w * 1.08, 2.5 + rnd() * 2, d * 1.08));
          roofs.setMatrixAt(nh, m);
          nh++;
        }
      }
    }
    houses.count = roofs.count = nh;
    towersM.count = nt;
    for (const im of [houses, roofs, towersM]) {
      im.castShadow = true;
      im.receiveShadow = true;
      this.scene.add(im);
    }

    // trees: two-lobed canopies
    const leaf = new THREE.IcosahedronGeometry(1, 2);
    const trees = new THREE.InstancedMesh(leaf, new THREE.MeshStandardMaterial({ roughness: 0.95 }), 2600);
    let nt2 = 0;
    for (let i = 0; i < 2600; i++) {
      const near = i < 180;
      const r = near ? 48 + rnd() * 40 : 70 + Math.pow(rnd(), 0.7) * 1100;
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r * (near ? 1.4 : 1);
      const z = Math.sin(a) * r * (near ? 0.7 : 1);
      if (Math.abs(x) < 46 && Math.abs(z) < 22) continue;
      const sc = near ? 2.4 + rnd() * 2.2 : 2 + rnd() * 3;
      m.compose(new THREE.Vector3(x, sc * 1.1, z), q, new THREE.Vector3(sc, sc * 0.85, sc));
      trees.setMatrixAt(nt2, m);
      trees.setColorAt(nt2, col.setHSL(0.25 + rnd() * 0.06, 0.32, 0.13 + rnd() * 0.08));
      nt2++;
    }
    trees.count = nt2;
    trees.castShadow = true;
    trees.receiveShadow = true;
    this.scene.add(trees);
  }

  private buildPodium() {
    const white = new THREE.MeshStandardMaterial({ color: '#f4f3ef', roughness: 0.45 });
    const dark = new THREE.MeshPhysicalMaterial({ color: '#1b2430', roughness: 0.08, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.2 });
    const parts: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    for (let l = 0; l < PODIUM_LEVELS; l++) {
      const pts = podiumOutline(l);
      const y = l * PODIUM_H;
      parts.push(slab(pts, y + PODIUM_H - 1.3, 1.3));
      glass.push(ring(pts.map(([x, z]) => [x * 0.985, z * 0.97] as [number, number]), y, PODIUM_H - 1.3, 0, 0));
    }
    const pm = new THREE.Mesh(mergeGeometries(parts)!, white);
    const gm = new THREE.Mesh(mergeGeometries(glass)!, dark);
    for (const mm of [pm, gm]) {
      mm.castShadow = mm.receiveShadow = true;
      this.scene.add(mm);
    }
    // roof deck + pool between the towers
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(14, 22), new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.9 }));
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, PODIUM_TOP + 0.08, 0);
    deck.receiveShadow = true;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 16),
      new THREE.MeshPhysicalMaterial({ color: '#2fb6d6', roughness: 0.05, metalness: 0.1, transmission: 0, clearcoat: 1, emissive: '#0a5f74', emissiveIntensity: 0.25 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, PODIUM_TOP + 0.12, 2);
    this.scene.add(deck, water);
    // planters
    const planter = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshStandardMaterial({ color: '#3f7d3a', roughness: 1 }), 30);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      m.compose(new THREE.Vector3(side * (36 + Math.random() * 4), PODIUM_TOP + 1, -12 + i * 0.9), new THREE.Quaternion(), new THREE.Vector3(1.6, 1.3, 1.6));
      planter.setMatrixAt(i, m);
    }
    planter.castShadow = true;
    this.scene.add(planter);
  }

  private buildTower(tower: TowerId): TowerParts {
    const [ox, oz] = TOWER_POS[tower];
    const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e5);
    const slabs: THREE.BufferGeometry[] = [];
    const rails: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const faceUnit: number[] = [];
    const idx = new Map(this.units.map((u, i) => [u.id, i]));

    // lobby glass between podium and first residential floor
    for (let f = FIRST_RES_FLOOR; f <= TOP_FLOOR; f++) {
      const y = floorY(f);
      const edge = slabEdge(tower, f);
      slabs.push(slab(edge, y, 0.85, ox, oz));
      // glass balustrade along the slab edge
      rails.push(ring(edge.map(([x, z], i) => [x - CORE_N[i][0] * 0.15, z - CORE_N[i][1] * 0.15] as [number, number]), y + 0.95, 1.05, ox, oz));
      // recessed curtain wall, split into unit sectors
      glass.push(ring(CORE, y + 0.95, FH - 0.95, ox, oz));
      const fl = this.units.filter((u) => u.tower === tower && u.floor === f);
      const per = fl.length || 1;
      for (let i = 0; i < N; i++) {
        const k = Math.floor(((i / N + 0.125) % 1) * per) % per;
        const u = fl.find((x) => x.index === k);
        const ui = u ? idx.get(u.id) ?? -1 : -1;
        faceUnit.push(ui, ui);
      }
    }
    // roof slab + crown + plant rooms
    const roofY = floorY(TOP_FLOOR + 1);
    slabs.push(slab(slabEdge(tower, TOP_FLOOR + 1), roofY, 1.1, ox, oz));
    slabs.push(slab(plate(0.98), roofY + 1.1, 1.4, ox, oz));
    const pr = new THREE.BoxGeometry(8, 3.2, 5).translate(ox - 3, roofY + 4.1, oz).toNonIndexed();
    const pr2 = new THREE.BoxGeometry(4, 2.4, 4).translate(ox + 6, roofY + 3.7, oz + 2).toNonIndexed();
    slabs.push(pr, pr2);
    // podium-to-tower plinth glazing
    glass.push(ring(CORE, PODIUM_TOP, 0.95, ox, oz));
    for (let i = 0; i < N; i++) faceUnit.push(-1, -1);

    const slabGeo = mergeGeometries(slabs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => {
      // drop uv/normal mismatches: keep position+normal only
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', g.getAttribute('position'));
      ng.setAttribute('normal', g.getAttribute('normal'));
      return ng;
    }))!;
    const slabMat = new THREE.MeshStandardMaterial({ color: '#efedea', roughness: 0.5, envMapIntensity: 3.2, metalness: 0.0, clippingPlanes: [clip], side: THREE.DoubleSide });
    const slabMesh = new THREE.Mesh(slabGeo, slabMat);
    slabMesh.castShadow = slabMesh.receiveShadow = true;

    const railMat = new THREE.MeshPhysicalMaterial({ color: '#a9c4cf', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, clippingPlanes: [clip], side: THREE.DoubleSide, depthWrite: false });
    const railMesh = new THREE.Mesh(mergeGeometries(rails)!, railMat);

    const glassGeo = mergeGeometries(glass)!;
    const vcount = glassGeo.getAttribute('position').count;
    glassGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vcount * 3).fill(1), 3));
    const glassMat = new THREE.MeshPhysicalMaterial({
      map: mullionTexture(),
      vertexColors: true,
      roughness: 0.06,
      metalness: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.4,
      clippingPlanes: [clip],
      side: THREE.DoubleSide,
    });
    glassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = { value: 0 };
      sh.uniforms.uTint = { value: 0 };
      glassMat.userData.sh = sh;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow; uniform float uTint;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * uGlow;');
    };
    this.glassMats.push(glassMat);
    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.castShadow = true;
    glassMesh.receiveShadow = true;
    glassMesh.userData.tower = tower;

    this.scene.add(slabMesh, glassMesh, railMesh);

    const fu = Int32Array.from(faceUnit);
    const vu = new Int32Array(vcount);
    for (let f = 0; f < fu.length; f++) for (let k = 0; k < 3; k++) vu[f * 3 + k] = fu[f];
    const tint = new Float32Array(vcount);
    let s = tower === '16' ? 3 : 9;
    for (let i = 0; i < vcount; i += 6) {
      s = (s * 16807) % 2147483647;
      const v = s / 2147483647;
      for (let k = 0; k < 6; k++) tint[i + k] = v;
    }
    return { glass: glassMesh, slab: slabMesh, rail: railMesh, faceUnit: fu, vertUnit: vu, vertTint: tint, clip };
  }

  private buildBridge() {
    const y = floorY(BRIDGE_FLOOR);
    const x0 = TOWER_POS['16'][0] + HALF.x - 0.5;
    const x1 = TOWER_POS['17'][0] - HALF.x + 0.5;
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    const cz = (TOWER_POS['16'][1] + TOWER_POS['17'][1]) / 2;
    const frame = new THREE.MeshStandardMaterial({ color: '#f3f2ee', roughness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: '#25323d', roughness: 0.05, metalness: 0.6, clearcoat: 1, envMapIntensity: 1.3 });
    const g = new THREE.Group();
    const floorB = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 7), frame);
    floorB.position.set(cx, y, cz);
    const roofB = new THREE.Mesh(new THREE.BoxGeometry(len, 0.7, 7.2), frame);
    roofB.position.set(cx, y + FH * 2 - 0.35, cz);
    const body = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, FH * 2 - 1.2, 6.4), glass);
    body.position.set(cx, y + FH - 0.05, cz);
    g.add(floorB, roofB, body);
    for (let k = 0; k <= 8; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, FH * 2 - 1, 7), frame);
      fin.position.set(x0 + (len * k) / 8, y + FH, cz);
      g.add(fin);
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = (o as THREE.Mesh).receiveShadow = true));
    this.scene.add(g);
  }

  // ------------------------------------------------------------------ public API
  onPick(cb: PickHandler) { this.pickCb = cb; }
  onHover(cb: HoverHandler) { this.hoverCb = cb; }
  setColorFn(fn: (u: Unit) => string | null) { this.colorFn = fn; this.refresh(); }
  setSelected(id: string | null) { this.selectedId = id; this.refresh(); this.refreshDoll(); }
  setAutoRotate(on: boolean) { this.controls.autoRotate = on; }

  setFrameOffset(fx: number, fy = 0) {
    this.offset = { x: fx, y: fy };
    this.resize();
  }

  setEmbedded(noTouch: boolean) {
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    if (noTouch) {
      this.controls.enabled = false;
      this.renderer.domElement.style.touchAction = 'pan-y';
    }
  }

  setHighlight(h: Hl) {
    this.hl = h;
    if (h) {
      const [ox, oz] = TOWER_POS[h.tower];
      const y = floorY(h.floor) + FH * 0.55;
      const pts = slabEdge(h.tower, h.floor).map(([x, z], i) => new THREE.Vector3(x + ox + CORE_N[i][0] * 0.9, y, z + oz + CORE_N[i][1] * 0.9));
      this.hlRing.geometry.dispose();
      this.hlRing.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    this.hlRing.visible = !!h && !this.dollFor;
    this.refresh();
  }

  /** Open the tower like a dollhouse at a floor (null closes it). */
  setCutaway(c: { tower: TowerId; floor: number } | null) {
    this.dollFor = c;
    (['16', '17'] as TowerId[]).forEach((t) => {
      this.towers[t].clip.constant = c && c.tower === t ? floorY(c.floor) + 0.9 : 1e5;
    });
    this.hlRing.visible = !!this.hl && !c;
    this.buildDoll();
  }

  setHour(h: number) {
    this.hour = h;
    const day = h > 6.0 && h < 18.9;
    const tt = THREE.MathUtils.clamp((h - 6.2) / (18.7 - 6.2), 0, 1);
    const elev = day ? Math.sin(tt * Math.PI) * 72 + 1.5 : -8;
    const az = 90 - 180 * tt; // east → north → west (southern hemisphere)
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(az);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    dir.set(dir.x, dir.y, -dir.z);
    this.sky.material.uniforms.sunPosition.value.copy(dir);
    const golden = day ? Math.max(0, 1 - elev / 18) : 0;
    this.glow = day ? Math.max(0, golden - 0.55) * 1.6 : 1;
    this.sun.position.copy(dir).multiplyScalar(400);
    this.sun.target.position.set(0, 30, 0);
    this.sun.intensity = day ? 0.5 + 1.9 * Math.min(1, elev / 25) : 0;
    this.sun.color.set('#ffffff').lerp(new THREE.Color('#ffae6b'), golden);
    this.hemi.intensity = day ? 0.25 + 0.25 * Math.min(1, elev / 30) : 0.1;
    this.hemi.color.set(day ? '#dfeaff' : '#5068a8');
    this.renderer.toneMappingExposure = day ? 0.5 + 0.12 * golden : 0.55;
    (this.scene.fog as THREE.Fog).color.set(day ? '#c9d6e2' : '#0b1124').lerp(new THREE.Color('#f0b48a'), golden * 0.6);
    this.sky.visible = day;
    this.scene.background = day ? null : new THREE.Color('#070c1c');

    // environment reflections from the current sky
    const s2 = this.skyScene.children[0] as Sky;
    s2.scale.setScalar(1000);
    const su = s2.material.uniforms;
    su.turbidity.value = 2.4; su.rayleigh.value = 2.1; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.82;
    su.sunPosition.value.copy(day ? dir : new THREE.Vector3(0, 0.05, -1));
    this.envRT?.dispose();
    this.envRT = this.pmrem.fromScene(this.skyScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = day ? 0.32 : 0.08;
    this.refresh();
  }

  focusOverview(ms = 1500) { this.flyTo(new THREE.Vector3(150, 85, 205), new THREE.Vector3(0, 58, 0), ms); }
  focusTower(t: TowerId | 'all', ms = 1400) {
    if (t === 'all') return this.focusOverview(ms);
    const [x, z] = TOWER_POS[t];
    this.flyTo(new THREE.Vector3(x * 3.2, 75, z + 150), new THREE.Vector3(x, 62, z), ms);
  }
  focusFloor(t: TowerId, floor: number, ms = 1300) {
    const [x, z] = TOWER_POS[t];
    const y = floorY(floor);
    const dir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    if (dir.lengthSq() < 0.1) dir.set(0.4, 0, 1).normalize();
    this.flyTo(new THREE.Vector3(x, y + 14, z).addScaledVector(dir, 95), new THREE.Vector3(x, y, z), ms);
  }
  /** Bird's-eye into the opened floor (the "inside" shot). */
  focusInside(t: TowerId, floor: number, ms = 1500) {
    const [x, z] = TOWER_POS[t];
    const y = floorY(floor);
    this.flyTo(new THREE.Vector3(x + 18, y + 44, z + 34), new THREE.Vector3(x, y, z), ms);
  }

  floorLabelPos(t: TowerId, floor: number) {
    const [x, z] = TOWER_POS[t];
    return this.project(new THREE.Vector3(x + (t === '16' ? -HALF.x - 3 : HALF.x + 3), floorY(floor) + FH / 2, z));
  }

  /** screen positions of unit labels in the open floor */
  dollLabels() {
    if (!this.dollFor) return [];
    const { tower, floor } = this.dollFor;
    const [ox, oz] = TOWER_POS[tower];
    const fl = this.units.filter((u) => u.tower === tower && u.floor === floor);
    return fl.map((u) => {
      const mid = ((u.index + 0.5) / u.perFloor - 0.125 + 1) % 1;
      const i = Math.floor(mid * N) % N;
      const [px, pz] = CORE[i];
      return { u, ...this.project(new THREE.Vector3(ox + px * 0.62, floorY(floor) + 1.2, oz + pz * 0.62)) };
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.envRT?.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ internals
  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height, visible: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, ms: number) {
    // portrait screens need more distance to keep the towers in frame
    const fit = THREE.MathUtils.clamp(1.3 / this.camera.aspect, 1, 2.6);
    if (fit > 1) pos = target.clone().add(pos.clone().sub(target).multiplyScalar(fit));
    this.fly = { a: this.camera.position.clone(), b: pos, ta: this.controls.target.clone(), tb: target, t: 0, d: ms / 1000 };
  }

  private buildDoll() {
    this.doll.clear();
    this.dollFills.clear();
    if (!this.dollFor) return;
    const { tower, floor } = this.dollFor;
    const [ox, oz] = TOWER_POS[tower];
    const y = floorY(floor) + 0.9;
    const fl = this.units.filter((u) => u.tower === tower && u.floor === floor);
    const per = fl.length;
    const wallMat = new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.6 });
    const walls: THREE.BufferGeometry[] = [];
    // outer wall stubs (cut curtain wall)
    walls.push(ring(CORE, y, 1.6, ox, oz));
    // core
    const core = plate(0.3).map(([x, z]) => [x, z] as [number, number]);
    walls.push(ring(core, y, 2.4, ox, oz));
    const coreTop = new THREE.Mesh(new THREE.ShapeGeometry(shape(core, ox, oz)).rotateX(-Math.PI / 2).translate(0, y + 2.4, 0), new THREE.MeshStandardMaterial({ color: '#9aa1a8' }));
    this.doll.add(coreTop);
    for (let k = 0; k < per; k++) {
      // partition along the sector boundary
      const a = ((k / per - 0.125 + 1) % 1) * N;
      const i = Math.floor(a) % N;
      const [px, pz] = CORE[i];
      const ix = px * 0.3;
      const iz = pz * 0.3;
      const len = Math.hypot(px - ix, pz - iz);
      const wall = new THREE.BoxGeometry(len, 2.2, 0.22);
      wall.rotateY(-Math.atan2(pz - iz, px - ix));
      wall.translate(ox + (px + ix) / 2, y + 1.1, oz + (pz + iz) / 2);
      walls.push(wall.toNonIndexed());
      // unit floor fill
      const u = fl.find((x) => x.index === k);
      if (!u) continue;
      const s0 = Math.floor(((k / per - 0.125 + 1) % 1) * N);
      const s1 = Math.floor((((k + 1) / per - 0.125 + 1) % 1) * N);
      const outer: [number, number][] = [];
      for (let j = s0; j !== s1; j = (j + 1) % N) outer.push(CORE[j]);
      outer.push(CORE[s1 % N]);
      const inner = outer.map(([x, z]) => [x * 0.3, z * 0.3] as [number, number]).reverse();
      const poly = [...outer.map(([x, z]) => [x * 0.985, z * 0.985] as [number, number]), ...inner];
      const geo = new THREE.ShapeGeometry(shape(poly, ox, oz)).rotateX(-Math.PI / 2).translate(0, y + 0.06, 0);
      const fill = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, transparent: true, opacity: 0.92 }));
      fill.userData.unit = u;
      this.dollFills.set(u.id, fill);
      this.doll.add(fill);
    }
    const wm = new THREE.Mesh(mergeGeometries(walls.map((g) => {
      const ng = new THREE.BufferGeometry();
      ng.setAttribute('position', g.getAttribute('position'));
      ng.setAttribute('normal', g.getAttribute('normal'));
      return ng;
    }))!, wallMat);
    wm.castShadow = wm.receiveShadow = true;
    this.doll.add(wm);
    this.refreshDoll();
  }

  private refreshDoll() {
    this.dollFills.forEach((m, id) => {
      const u = m.userData.unit as Unit;
      const c = this.colorFn(u) || '#d9d6cf';
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.color.set(id === this.selectedId ? '#c8ffd6' : c);
      mat.emissive.set(id === this.selectedId ? '#2BE35A' : '#000000');
      mat.emissiveIntensity = id === this.selectedId ? 0.35 : 0;
    });
  }

  refresh() {
    const night = this.glow;
    const base = new THREE.Color('#ffffff');
    const warm = new THREE.Color('#ffc887');
    const dim = new THREE.Color('#5d6670');
    const tmp = new THREE.Color();
    let anyStatus = false;
    const cache = new Map<number, THREE.Color | null>();
    (['16', '17'] as TowerId[]).forEach((t) => {
      const parts = this.towers[t];
      if (!parts) return;
      const col = parts.glass.geometry.getAttribute('color') as THREE.BufferAttribute;
      const arr = col.array as Float32Array;
      for (let v = 0; v < parts.vertUnit.length; v++) {
        const ui = parts.vertUnit[v];
        if (ui < 0) {
          tmp.copy(base).lerp(warm, night * 0.6);
        } else {
          let c = cache.get(ui);
          if (c === undefined) {
            const hex = this.colorFn(this.units[ui]);
            c = hex ? new THREE.Color(hex) : null;
            cache.set(ui, c);
          }
          if (c) anyStatus = true;
          const u = this.units[ui];
          const inHl = !this.hl || (u.tower === this.hl.tower && u.floor === this.hl.floor);
          if (c) {
            tmp.copy(c);
            if (!inHl) tmp.lerp(dim, 0.75);
          } else {
            tmp.copy(base);
            if (night > 0 && parts.vertTint[v] < 0.6) tmp.lerp(warm, night);
            if (this.hl && !inHl) tmp.lerp(dim, 0.4);
          }
          if (ui === this.hoverIdx) tmp.lerp(new THREE.Color('#ffffff'), 0.5);
          if (u.id === this.selectedId) tmp.set('#ffffff');
        }
        arr[v * 3] = tmp.r;
        arr[v * 3 + 1] = tmp.g;
        arr[v * 3 + 2] = tmp.b;
      }
      col.needsUpdate = true;
    });
    for (const m of this.glassMats) {
      const sh = m.userData.sh as { uniforms: { uGlow: { value: number } } } | undefined;
      if (sh) sh.uniforms.uGlow.value = anyStatus ? 0.35 + night * 0.5 : night * 1.1;
      // status mode: glazing becomes a lit colour panel (like the sample); natural mode: reflective glass
      if (!m.userData.tex) m.userData.tex = m.map;
      const want = anyStatus ? null : (m.userData.tex as THREE.Texture);
      if (m.map !== want) { m.map = want; m.needsUpdate = true; }
      m.metalness = anyStatus ? 0 : 0.4;
      m.roughness = anyStatus ? 0.55 : 0.1;
      m.clearcoat = anyStatus ? 0 : 0.6;
      m.envMapIntensity = anyStatus ? 0.2 : 1.6;
      m.color.set(anyStatus ? '#ffffff' : '#ffffff');
    }
  }

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ptr, this.camera);
    const targets: THREE.Object3D[] = [this.towers['16'].glass, this.towers['17'].glass, ...this.dollFills.values()];
    const hits = this.raycaster.intersectObjects(targets, false);
    for (const h of hits) {
      if (h.object.userData.unit) return this.units.indexOf(h.object.userData.unit);
      const t = h.object.userData.tower as TowerId;
      // respect the cutaway plane
      if (this.towers[t].clip.distanceToPoint(h.point) < 0) continue;
      const ui = this.towers[t].faceUnit[h.faceIndex ?? -1];
      return ui ?? -1;
    }
    return -1;
  }

  private setHover(i: number, x: number, y: number) {
    if (i !== this.hoverIdx) {
      this.hoverIdx = i;
      this.refresh();
      this.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : 'grab';
    }
    this.hoverCb(i >= 0 ? this.units[i] : null, x, y);
  }
  private onMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.setHover(this.pick(e), e.clientX - r.left, e.clientY - r.top);
  };
  private onDown = (e: PointerEvent) => (this.down = { x: e.clientX, y: e.clientY, t: performance.now() });
  private onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 6 || performance.now() - this.down.t > 600) return;
    const i = this.pick(e);
    this.pickCb(i >= 0 ? this.units[i] : null);
  };

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    if (this.offset.x || this.offset.y) this.camera.setViewOffset(w, h, -w * this.offset.x, h * this.offset.y, w, h);
    else this.camera.clearViewOffset();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.gtao.setSize(w, h);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.fly) {
      this.fly.t += dt / this.fly.d;
      const k = 1 - Math.pow(1 - Math.min(1, this.fly.t), 3);
      this.camera.position.lerpVectors(this.fly.a, this.fly.b, k);
      this.controls.target.lerpVectors(this.fly.ta, this.fly.tb, k);
      if (this.fly.t >= 1) this.fly = null;
    }
    this.controls.update();
    this.composer.render();
  };
}
