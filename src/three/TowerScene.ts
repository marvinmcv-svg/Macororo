import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGE_FLOOR, FIRST_RES_FLOOR, TOP_FLOOR, type TowerId, type Unit } from '../data/units';

/**
 * Procedural digital twin of Macororó 16 | 17:
 * two 37-floor towers with undulating white balcony slabs, an amenity podium
 * and the structural bridge. Every residential unit is a pickable sector of
 * the glass curtain wall whose colour is driven by availability / filters.
 */

const FLOOR_H = 0.88;
const SEG = 96; // samples around each floor plate
const PODIUM_FLOORS = 5;
const TOWER_X: Record<TowerId, number> = { '16': -6.6, '17': 6.6 };

type Keyframe = {
  h: number;
  top: string;
  horizon: string;
  ground: string;
  sun: string;
  sunI: number;
  amb: number;
  glow: number; // interior window glow 0..1
  slab: string;
};

// Time-of-day palette tuned for Santa Cruz de la Sierra (sunrise ≈ 6:15, sunset ≈ 18:45)
const KEYS: Keyframe[] = [
  { h: 0, top: '#03060f', horizon: '#0b1630', ground: '#0a0d10', sun: '#5b6e9a', sunI: 0.18, amb: 0.22, glow: 1, slab: '#9aa3b5' },
  { h: 5.2, top: '#050b1c', horizon: '#1a2547', ground: '#0c1014', sun: '#6c7aa8', sunI: 0.2, amb: 0.25, glow: 0.9, slab: '#a3aabb' },
  { h: 6.3, top: '#2a3f74', horizon: '#ff9a62', ground: '#2a2724', sun: '#ffae6b', sunI: 1.2, amb: 0.45, glow: 0.45, slab: '#f1ddcc' },
  { h: 8, top: '#3c79cf', horizon: '#cfe3f5', ground: '#3a4036', sun: '#fff1d8', sunI: 2.4, amb: 0.7, glow: 0, slab: '#f6f4ef' },
  { h: 12.5, top: '#2f6fd0', horizon: '#d8ecff', ground: '#414a3d', sun: '#ffffff', sunI: 2.8, amb: 0.8, glow: 0, slab: '#ffffff' },
  { h: 16.5, top: '#3a74c4', horizon: '#f3dcc0', ground: '#3d3f35', sun: '#ffe2b5', sunI: 2.3, amb: 0.65, glow: 0.05, slab: '#fbf2e6' },
  { h: 18.2, top: '#3a3e76', horizon: '#ff7a45', ground: '#2b2420', sun: '#ff8a4c', sunI: 1.3, amb: 0.42, glow: 0.55, slab: '#f4cdb5' },
  { h: 19.3, top: '#0d1430', horizon: '#3b2a55', ground: '#101218', sun: '#7d6aa8', sunI: 0.3, amb: 0.28, glow: 0.95, slab: '#b2adc4' },
  { h: 24, top: '#03060f', horizon: '#0b1630', ground: '#0a0d10', sun: '#5b6e9a', sunI: 0.18, amb: 0.22, glow: 1, slab: '#9aa3b5' },
];

function sampleKeys(h: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    top: c(a.top, b.top),
    horizon: c(a.horizon, b.horizon),
    ground: c(a.ground, b.ground),
    sun: c(a.sun, b.sun),
    sunI: n(a.sunI, b.sunI),
    amb: n(a.amb, b.amb),
    glow: n(a.glow, b.glow),
    slab: c(a.slab, b.slab),
  };
}

// ---- floor plate geometry ---------------------------------------------------

function superellipse(a: number, b: number, n: number, t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const x = Math.sign(c) * a * Math.pow(Math.abs(c), 2 / n);
  const z = Math.sign(s) * b * Math.pow(Math.abs(s), 2 / n);
  return [x, z];
}

/** Outline of a tower floor plate (local coords), with the signature wave. */
function towerOutline(tower: TowerId, floor: number, grow = 0): [number, number][] {
  const side = tower === '16' ? 1 : -1; // +1 means "towards the other tower" is +x
  const f = floor;
  // lean toward each other around the bridge, plus a slow facade wave
  const lean = 1.7 * Math.exp(-Math.pow((f - BRIDGE_FLOOR) / 8, 2));
  const wave = 0.45 * Math.sin(f * 0.19 + (tower === '16' ? 0 : 1.7));
  const sx = 1 + 0.07 * Math.sin(f * 0.23 + (tower === '16' ? 0.6 : 2.4));
  const sz = 1 + 0.05 * Math.cos(f * 0.17);
  const a = 3.2 * sx + grow;
  const b = 4.6 * sz + grow;
  const pts: [number, number][] = [];
  for (let i = 0; i < SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const [x, z] = superellipse(a, b, 2.5, t);
    // balconies bulge more on the outer (street) face, making the slabs undulate
    const bulge = grow > 0 ? 0.35 * Math.max(0, Math.sin(t * 2 + f * 0.35)) : 0;
    pts.push([x + side * (lean + wave) + Math.sign(x) * bulge * 0.6, z + Math.sign(z) * bulge]);
  }
  return pts;
}

function podiumOutline(level: number): [number, number][] {
  const pts: [number, number][] = [];
  const a = 12.5 + (level === 0 ? 0.6 : 0);
  for (let i = 0; i < SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const [x, z] = superellipse(a, 6.8, 3.2, t);
    pts.push([x, z + 0.6]);
  }
  return pts;
}

function shapeFrom(pts: [number, number][]) {
  const s = new THREE.Shape();
  // Shape lives in XY; we rotate so Y→-Z. Flip z sign so the extrusion maps correctly.
  pts.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)));
  s.closePath();
  return s;
}

function slabGeometry(pts: [number, number][], y: number, depth: number) {
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts), { depth, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

/** Non-indexed curtain wall ring so each sector can carry its own vertex colour. */
function wallRing(pts: [number, number][], y0: number, h: number, scale: number, ox: number) {
  const pos: number[] = [];
  const nor: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    const ax = x1 * scale + ox;
    const az = z1 * scale;
    const bx = x2 * scale + ox;
    const bz = z2 * scale;
    const nx = bz - az;
    const nz = -(bx - ax);
    const l = Math.hypot(nx, nz) || 1;
    const quad = [
      [ax, y0, az], [bx, y0, bz], [bx, y0 + h, bz],
      [ax, y0, az], [bx, y0 + h, bz], [ax, y0 + h, az],
    ];
    for (const q of quad) {
      pos.push(...q);
      nor.push(nx / l, 0, nz / l);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

// ---- scene ------------------------------------------------------------------

export type PickHandler = (unit: Unit | null) => void;
export type HoverHandler = (unit: Unit | null, x: number, y: number) => void;
export type FloorHighlight = { tower: TowerId; floor: number } | null;

export class TowerScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private raf = 0;
  private clock = new THREE.Clock();
  private ro: ResizeObserver;

  private sun = new THREE.DirectionalLight('#ffffff', 2.5);
  private hemi = new THREE.HemisphereLight('#cfe3ff', '#3a3a30', 0.7);
  private skyMat: THREE.ShaderMaterial;
  private groundMat: THREE.MeshStandardMaterial;
  private slabMat: THREE.MeshStandardMaterial;
  private glassMat: THREE.MeshStandardMaterial;
  private cityMat: THREE.MeshStandardMaterial;
  private sunDisc: THREE.Mesh;

  private units: Unit[] = [];
  private glassMesh!: THREE.Mesh;
  private faceUnit: Int32Array = new Int32Array(0); // triangle -> unit index
  private vertUnit: Int32Array = new Int32Array(0); // vertex -> unit index (-1 = non residential)
  private vertFloorTint: Float32Array = new Float32Array(0);
  private colorFn: (u: Unit) => string | null = () => null;
  private highlight: FloorHighlight = null;
  private highlightRing: THREE.LineLoop;
  private hoverIdx = -1;
  private selectedId: string | null = null;
  private glow = 0;
  hour = 12.5;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private downAt = { x: 0, y: 0, t: 0 };
  private onPickCb: PickHandler = () => {};
  private onHoverCb: HoverHandler = () => {};
  private fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; d: number } | null = null;
  private interacted = false;
  private offsetX = 0;
  private offsetY = 0;

  constructor(container: HTMLElement, units: Unit[]) {
    this.container = container;
    this.units = units;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';

    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.5, 900);
    this.camera.position.set(50, 28, 64);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 16, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 160;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.addEventListener('start', () => {
      this.interacted = true;
      this.fly = null;
    });

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#2f6fd0') },
        horizon: { value: new THREE.Color('#d8ecff') },
        ground: { value: new THREE.Color('#414a3d') },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;
        void main(){ float y = vP.y; vec3 c = y>0.0 ? mix(horizon, top, pow(clamp(y,0.0,1.0),0.55)) : mix(horizon, ground, clamp(-y*6.0,0.0,1.0));
        gl_FragColor = vec4(c,1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), this.skyMat);
    this.scene.add(sky);

    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(7, 24, 12),
      new THREE.MeshBasicMaterial({ color: '#fff6e0', fog: false }),
    );
    this.scene.add(this.sunDisc);

    this.scene.fog = new THREE.Fog('#cfe3f5', 140, 520);

    // lights
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // materials
    this.groundMat = new THREE.MeshStandardMaterial({ color: '#414a3d', roughness: 1 });
    this.slabMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55, metalness: 0.02, side: THREE.DoubleSide });
    this.glassMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.22,
      metalness: 0.35,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0,
      side: THREE.DoubleSide,
    });
    // let vertex colours drive emissive too so status colours glow at night
    this.glassMat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = { value: 0 };
      (this.glassMat.userData as { shader?: typeof shader }).shader = shader;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance = vColor.rgb * uGlow;');
    };
    this.cityMat = new THREE.MeshStandardMaterial({ color: '#d9d6cf', roughness: 0.9 });

    this.buildGround();
    this.buildCity();
    this.buildTowers();

    this.highlightRing = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#2BE35A', transparent: true, opacity: 0.95, depthTest: false }),
    );
    this.highlightRing.renderOrder = 10;
    this.highlightRing.visible = false;
    this.scene.add(this.highlightRing);

    this.setHour(this.hour);
    this.refreshColors();

    // events
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', () => this.setHover(-1, 0, 0));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.loop();
  }

  // ---------------------------------------------------------------- builders
  private buildGround() {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(420, 64), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // site plaza + roads
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(24, 64),
      new THREE.MeshStandardMaterial({ color: '#c9c3b6', roughness: 0.95 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.02;
    plaza.scale.set(1.25, 1, 0.85);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    const roadMat = new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 1 });
    const mkRoad = (w: number, l: number, x: number, z: number, r: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), roadMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = r;
      m.position.set(x, 0.03, z);
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mkRoad(7, 700, -34, 0, 0.18); // Av. Beni
    mkRoad(5, 700, 0, 26, Math.PI / 2 + 0.05); // Calle Las Maras
    mkRoad(4, 700, 0, -26, Math.PI / 2 - 0.04); // Calle Achachairú
    mkRoad(9, 900, 60, 60, -0.75); // 2do anillo (suggested)
  }

  private buildCity() {
    const rnd = (() => {
      let s = 42;
      return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    })();
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const count = 420;
    const city = new THREE.InstancedMesh(box, this.cityMat, count);
    const roofCol = new THREE.Color();
    const m = new THREE.Matrix4();
    let n = 0;
    for (let i = 0; i < count * 3 && n < count; i++) {
      const r = 34 + Math.pow(rnd(), 0.8) * 230;
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x + 34 - z * 0.18) < 6) continue; // keep Av. Beni clear
      const tall = rnd() < 0.1;
      const hgt = tall ? 8 + rnd() * 16 : 1 + rnd() * 3.2;
      const sx = tall ? 4 + rnd() * 3 : 3 + rnd() * 6;
      const sz = tall ? 4 + rnd() * 3 : 3 + rnd() * 6;
      m.compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.4),
        new THREE.Vector3(sx, hgt, sz),
      );
      city.setMatrixAt(n, m);
      // terracotta roofs for houses like Santa Cruz's low-rise fabric
      roofCol.set(tall ? '#e6e3dc' : rnd() < 0.6 ? '#c9744f' : '#e7dfd2');
      city.setColorAt(n, roofCol);
      n++;
    }
    city.count = n;
    city.castShadow = true;
    city.receiveShadow = true;
    this.scene.add(city);

    // trees
    const treeGeo = new THREE.IcosahedronGeometry(1, 1);
    const treeMat = new THREE.MeshStandardMaterial({ color: '#2f6b35', roughness: 1, flatShading: true });
    const trees = new THREE.InstancedMesh(treeGeo, treeMat, 360);
    const c = new THREE.Color();
    for (let i = 0; i < 360; i++) {
      const near = i < 70;
      const r = near ? 16 + rnd() * 12 : 30 + rnd() * 160;
      const a = rnd() * Math.PI * 2;
      const s = near ? 0.9 + rnd() * 0.9 : 0.8 + rnd() * 1.6;
      m.compose(
        new THREE.Vector3(Math.cos(a) * r * (near ? 1.2 : 1), s * 0.9, Math.sin(a) * r * (near ? 0.8 : 1)),
        new THREE.Quaternion(),
        new THREE.Vector3(s, s * 0.9, s),
      );
      trees.setMatrixAt(i, m);
      trees.setColorAt(i, c.setHSL(0.3 + rnd() * 0.06, 0.45, 0.22 + rnd() * 0.1));
    }
    trees.castShadow = true;
    this.scene.add(trees);
  }

  private buildTowers() {
    const slabs: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    const faceUnit: number[] = [];
    const unitIndex = new Map(this.units.map((u, i) => [u.id, i]));

    // podium
    for (let l = 0; l < PODIUM_FLOORS; l++) {
      const pts = podiumOutline(l);
      const y = l * FLOOR_H * 1.25;
      slabs.push(slabGeometry(pts, y + FLOOR_H * 1.25 - 0.16, 0.16));
      const g = wallRing(pts, y, FLOOR_H * 1.25 - 0.16, l === 0 ? 0.97 : 0.985, 0);
      glass.push(g);
      for (let i = 0; i < SEG * 2; i++) faceUnit.push(-1);
    }
    const podiumTop = PODIUM_FLOORS * FLOOR_H * 1.25;

    for (const tower of ['16', '17'] as TowerId[]) {
      const ox = TOWER_X[tower];
      for (let f = FIRST_RES_FLOOR; f <= TOP_FLOOR + 1; f++) {
        const y = podiumTop + (f - FIRST_RES_FLOOR) * FLOOR_H;
        const balcony = towerOutline(tower, f, 0.55).map(([x, z]) => [x + ox, z] as [number, number]);
        slabs.push(slabGeometry(balcony, y, 0.12));
        if (f > TOP_FLOOR) {
          // crown
          const crown = towerOutline(tower, f, 0.1).map(([x, z]) => [x + ox, z] as [number, number]);
          slabs.push(slabGeometry(crown, y, 1.2));
          continue;
        }
        const core = towerOutline(tower, f, 0);
        const g = wallRing(core, y + 0.12, FLOOR_H - 0.12, 0.93, ox);
        glass.push(g);
        const floorUnits = this.units.filter((u) => u.tower === tower && u.floor === f);
        const per = floorUnits.length || 1;
        for (let i = 0; i < SEG; i++) {
          // shift sectors so unit A faces the street (+z)
          const k = Math.floor((((i / SEG + 0.125) % 1) * per)) % per;
          const u = floorUnits.find((x) => x.index === k);
          const idx = u ? unitIndex.get(u.id) ?? -1 : -1;
          faceUnit.push(idx, idx);
        }
      }
      // tower base between podium and first floor (lobby columns as a dark ring)
    }

    // structural bridge — a saddle-shaped white volume between the towers
    const by = podiumTop + (BRIDGE_FLOOR - FIRST_RES_FLOOR) * FLOOR_H;
    const bs = new THREE.Shape();
    const bw = 2.6;
    bs.moveTo(-bw, 1.2);
    bs.lineTo(bw, 1.2);
    bs.lineTo(bw, -2.6);
    bs.quadraticCurveTo(0, 0.3, -bw, -2.6);
    bs.closePath();
    const bridge = new THREE.ExtrudeGeometry(bs, { depth: 3.6, bevelEnabled: true, bevelSize: 0.25, bevelThickness: 0.25, bevelSegments: 3, curveSegments: 24 });
    bridge.translate(0, by, -1.8);
    slabs.push(bridge);

    const slabGeo = mergeGeometries(slabs.map((g) => g.toNonIndexed()), false)!;
    slabGeo.computeVertexNormals();
    const slabMesh = new THREE.Mesh(slabGeo, this.slabMat);
    slabMesh.castShadow = true;
    slabMesh.receiveShadow = true;
    this.scene.add(slabMesh);

    const glassGeo = mergeGeometries(glass, false)!;
    const vcount = glassGeo.getAttribute('position').count;
    glassGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vcount * 3), 3));
    this.glassMesh = new THREE.Mesh(glassGeo, this.glassMat);
    this.glassMesh.receiveShadow = true;
    this.glassMesh.castShadow = true;
    this.scene.add(this.glassMesh);

    this.faceUnit = Int32Array.from(faceUnit);
    this.vertUnit = new Int32Array(vcount);
    this.vertFloorTint = new Float32Array(vcount);
    for (let f = 0; f < this.faceUnit.length; f++) {
      for (let k = 0; k < 3; k++) this.vertUnit[f * 3 + k] = this.faceUnit[f];
    }
    // subtle per-vertex variation so lit windows look organic at night
    for (let i = 0; i < vcount; i += 6) {
      const v = Math.random();
      for (let k = 0; k < 6; k++) this.vertFloorTint[i + k] = v;
    }
  }

  // ---------------------------------------------------------------- public API
  onPick(cb: PickHandler) {
    this.onPickCb = cb;
  }
  onHover(cb: HoverHandler) {
    this.onHoverCb = cb;
  }

  setColorFn(fn: (u: Unit) => string | null) {
    this.colorFn = fn;
    this.refreshColors();
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.refreshColors();
  }

  setHighlight(h: FloorHighlight) {
    this.highlight = h;
    if (!h) {
      this.highlightRing.visible = false;
    } else {
      const podiumTop = PODIUM_FLOORS * FLOOR_H * 1.25;
      const y = podiumTop + (h.floor - FIRST_RES_FLOOR) * FLOOR_H + FLOOR_H * 0.55;
      const pts = towerOutline(h.tower, h.floor, 0.85).map(([x, z]) => new THREE.Vector3(x + TOWER_X[h.tower], y, z));
      this.highlightRing.geometry.dispose();
      this.highlightRing.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      this.highlightRing.visible = true;
    }
    this.refreshColors();
  }

  /** Embedded mode (landing hero): no wheel zoom so the page keeps scrolling; optional no-touch. */
  setEmbedded(disableTouch: boolean) {
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    if (disableTouch) {
      this.controls.enabled = false;
      this.renderer.domElement.style.touchAction = 'pan-y';
    }
  }

  setAutoRotate(on: boolean) {
    this.controls.autoRotate = on;
  }

  setHour(h: number) {
    this.hour = h;
    const k = sampleKeys(h);
    this.skyMat.uniforms.top.value.copy(k.top);
    this.skyMat.uniforms.horizon.value.copy(k.horizon);
    this.skyMat.uniforms.ground.value.copy(k.ground);
    (this.scene.fog as THREE.Fog).color.copy(k.horizon);
    this.groundMat.color.copy(k.ground).multiplyScalar(1.1);
    this.slabMat.color.copy(k.slab);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.hemi.intensity = k.amb;
    this.hemi.color.copy(k.horizon).lerp(new THREE.Color('#ffffff'), 0.5);
    this.hemi.groundColor.copy(k.ground);
    this.glow = k.glow;
    this.cityMat.color.set('#ffffff').lerp(new THREE.Color('#5a6070'), k.glow * 0.7);

    // sun path: rises east, crosses north (southern hemisphere), sets west
    const dayT = THREE.MathUtils.clamp((h - 6.2) / (18.8 - 6.2), 0, 1);
    const isDay = h > 6.0 && h < 19.0;
    const el = isDay ? Math.sin(dayT * Math.PI) * THREE.MathUtils.degToRad(74) + 0.02 : THREE.MathUtils.degToRad(35);
    const az = isDay ? THREE.MathUtils.degToRad(90 - 180 * dayT) : THREE.MathUtils.degToRad(-20);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sun.position.copy(dir).multiplyScalar(120);
    this.sun.target.position.set(0, 8, 0);
    this.sunDisc.position.copy(dir).multiplyScalar(520);
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(isDay ? k.sun : new THREE.Color('#dfe6ff'));
    this.sunDisc.scale.setScalar(isDay ? 1 : 0.55);
    this.renderer.toneMappingExposure = 0.9 + (1 - k.glow) * 0.2;
    this.refreshColors();
  }

  /** Returns sun azimuth/elevation in degrees for UI. */
  sunInfo() {
    const p = this.sun.position.clone().normalize();
    const el = THREE.MathUtils.radToDeg(Math.asin(p.y));
    let az = THREE.MathUtils.radToDeg(Math.atan2(p.x, -p.z));
    if (az < 0) az += 360;
    return { az, el };
  }

  focusOverview(ms = 1400) {
    this.flyTo(new THREE.Vector3(50, 28, 64), new THREE.Vector3(0, 16, 0), ms);
  }

  focusTower(t: TowerId | 'all', ms = 1300) {
    if (t === 'all') return this.focusOverview(ms);
    const x = TOWER_X[t];
    this.flyTo(new THREE.Vector3(x * 4, 24, 46), new THREE.Vector3(x, 17, 0), ms);
  }

  floorY(floor: number) {
    return PODIUM_FLOORS * FLOOR_H * 1.25 + (floor - FIRST_RES_FLOOR) * FLOOR_H;
  }

  focusFloor(t: TowerId, floor: number, ms = 1200) {
    const x = TOWER_X[t];
    const y = this.floorY(floor);
    const dir = this.camera.position.clone().sub(this.controls.target).setY(0).normalize();
    if (dir.lengthSq() < 0.1) dir.set(0.5, 0, 1).normalize();
    const pos = new THREE.Vector3(x, y + 7, 0).add(dir.multiplyScalar(48));
    this.flyTo(pos, new THREE.Vector3(x, y, 0), ms);
  }

  /** Screen-space position for an HTML label next to a floor. */
  floorLabelPos(t: TowerId, floor: number) {
    const v = new THREE.Vector3(TOWER_X[t] + (t === '16' ? -5 : 5), this.floorY(floor) + FLOOR_H / 2, 0).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width, y: ((1 - v.y) / 2) * r.height, visible: v.z < 1 };
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------- internals
  private flyTo(pos: THREE.Vector3, target: THREE.Vector3, ms: number) {
    this.fly = { from: this.camera.position.clone(), to: pos, tFrom: this.controls.target.clone(), tTo: target, t: 0, d: ms / 1000 };
  }

  refreshColors() {
    if (!this.glassMesh) return;
    const col = this.glassMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const arr = col.array as Float32Array;
    const night = this.glow;
    const base = new THREE.Color('#1c2b38').lerp(new THREE.Color('#0d1520'), night);
    const warm = new THREE.Color('#ffc47a');
    const dim = new THREE.Color('#26313b');
    const tmp = new THREE.Color();
    const cache = new Map<number, THREE.Color | null>();
    const hl = this.highlight;
    const shader = (this.glassMat.userData as { shader?: { uniforms: { uGlow: { value: number } } } }).shader;
    let anyStatus = false;

    for (let v = 0; v < this.vertUnit.length; v++) {
      const ui = this.vertUnit[v];
      if (ui < 0) {
        tmp.copy(base).lerp(warm, night * 0.55);
      } else {
        let c = cache.get(ui);
        if (c === undefined) {
          const u = this.units[ui];
          const hex = this.colorFn(u);
          c = hex ? new THREE.Color(hex) : null;
          if (c) anyStatus = true;
          cache.set(ui, c);
        }
        const u = this.units[ui];
        const inHl = !hl || (u.tower === hl.tower && u.floor === hl.floor);
        if (c) {
          tmp.copy(c);
          if (!inHl) tmp.lerp(dim, 0.82);
        } else {
          const lit = this.vertFloorTint[v] < 0.62;
          tmp.copy(base).lerp(warm, lit ? night * 0.9 : night * 0.12);
          if (hl && !inHl) tmp.lerp(dim, 0.5);
        }
        if (ui === this.hoverIdx) tmp.lerp(new THREE.Color('#ffffff'), 0.45);
        if (this.selectedId && u.id === this.selectedId) tmp.set('#ffffff');
      }
      arr[v * 3] = tmp.r;
      arr[v * 3 + 1] = tmp.g;
      arr[v * 3 + 2] = tmp.b;
    }
    col.needsUpdate = true;
    // status colours read as light panels; in natural mode only night windows glow
    if (shader) shader.uniforms.uGlow.value = anyStatus ? 0.55 + night * 0.35 : night * 0.9;
    this.glassMat.metalness = anyStatus ? 0.05 : 0.35;
    this.glassMat.roughness = anyStatus ? 0.5 : 0.22;
  }

  private pick(e: PointerEvent): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.glassMesh, false)[0];
    if (!hit || hit.faceIndex == null) return -1;
    return this.faceUnit[hit.faceIndex] ?? -1;
  }

  private setHover(idx: number, x: number, y: number) {
    if (idx !== this.hoverIdx) {
      this.hoverIdx = idx;
      this.refreshColors();
      this.renderer.domElement.style.cursor = idx >= 0 ? 'pointer' : 'grab';
    }
    this.onHoverCb(idx >= 0 ? this.units[idx] : null, x, y);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (e.buttons) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.setHover(this.pick(e), e.clientX - r.left, e.clientY - r.top);
  };
  private onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  private onPointerUp = (e: PointerEvent) => {
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    if (moved > 6 || performance.now() - this.downAt.t > 600) return;
    const idx = this.pick(e);
    this.onPickCb(idx >= 0 ? this.units[idx] : null);
  };

  /** Shift the rendered frame horizontally (fraction of width) to leave room for UI. */
  setFrameOffset(fx: number, fy = 0) {
    this.offsetX = fx;
    this.offsetY = fy;
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    if (this.offsetX || this.offsetY) this.camera.setViewOffset(w, h, -w * this.offsetX, h * this.offsetY, w, h);
    else this.camera.clearViewOffset();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  get userInteracted() {
    return this.interacted;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.fly) {
      this.fly.t += dt / this.fly.d;
      const k = 1 - Math.pow(1 - Math.min(this.fly.t, 1), 3);
      this.camera.position.lerpVectors(this.fly.from, this.fly.to, k);
      this.controls.target.lerpVectors(this.fly.tFrom, this.fly.tTo, k);
      if (this.fly.t >= 1) this.fly = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
