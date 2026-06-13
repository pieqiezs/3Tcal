import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader }    from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

/* ════════════════════════════════════════════════════════
   MUSIC SYSTEM
════════════════════════════════════════════════════════ */
const audio = new Audio();
audio.loop   = true;
audio.volume = 0.45;

// Try common filenames — user can place their audio file as:
//   music/bgm.mp3  OR  music/bgm.ogg  OR  music/bgm.wav
const MUSIC_PATHS = ['music/1975.mp3'];
let musicLoaded = false;
let musicPlaying = false;

function tryLoadMusic(paths, idx = 0) {
  if (idx >= paths.length) return;
  audio.src = paths[idx];
  audio.load();
  audio.addEventListener('canplaythrough', () => { musicLoaded = true; }, { once: true });
  audio.addEventListener('error', () => tryLoadMusic(paths, idx + 1), { once: true });
}
tryLoadMusic(MUSIC_PATHS);

function toggleMusic() {
  if (!musicLoaded) { showToast('Letakkan file audio di folder music/ (bgm.mp3/ogg/wav)'); return; }
  if (musicPlaying) { audio.pause(); musicPlaying = false; updateMusicBtn(); }
  else              { audio.play().then(() => { musicPlaying = true; updateMusicBtn(); }); }
}

function updateMusicBtn() {
  const btn = document.getElementById('btn-music');
  if (btn) btn.textContent = musicPlaying ? '♫ Music ON' : '♫ Music OFF';
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.getElementById('app').appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), 3000);
}

/* ════════════════════════════════════════════════════════
   RAINBOW COLOR SYSTEM
════════════════════════════════════════════════════════ */
// Predefined rainbow palette — cycles each Space press
const RAINBOW_PALETTE = [
  // [color, emissive] for X and O respectively
  { x: [0xff4081, 0xff1155], o: [0x40c4ff, 0x0088cc] }, // default: pink / cyan
  { x: [0xff6d00, 0xdd4400], o: [0x00e676, 0x00994d] }, // orange / green
  { x: [0xffea00, 0xcc9900], o: [0xaa00ff, 0x6600cc] }, // yellow / purple
  { x: [0x00e5ff, 0x0088bb], o: [0xff1744, 0xcc0022] }, // cyan / red
  { x: [0x69ff47, 0x33cc00], o: [0xff80ab, 0xcc0066] }, // lime / pink
  { x: [0xffd740, 0xcc8800], o: [0x40c4ff, 0x0055cc] }, // gold / sky
];
let paletteIdx = 0;

function cycleColors() {
  paletteIdx = (paletteIdx + 1) % RAINBOW_PALETTE.length;
  const pal = RAINBOW_PALETTE[paletteIdx];

  // Update all existing pieces in scene
  for (const [idx, mesh] of Object.entries(pieces)) {
    const isX = board[idx] === 'X';
    const [col, emi] = isX ? pal.x : pal.o;
    applyPieceMat(mesh, col, emi);
  }
  // Update procedural fallback colors too
  showToast(`🎨 Color theme ${paletteIdx + 1}/${RAINBOW_PALETTE.length}`);
}

function getCurrentColors() {
  return RAINBOW_PALETTE[paletteIdx];
}

/* ════════════════════════════════════════════════════════
   CONSTANTS
════════════════════════════════════════════════════════ */
const COLS      = 3;
const CELL_W    = 2.4;          // width of each cell box
const CELL_H    = 0.22;         // height of each cell box
const GAP       = 0.08;         // gap between cells
const STEP      = CELL_W + GAP; // grid step
const HALF      = (COLS - 1) / 2 * STEP; // offset to center grid

// Win line combos (indices 0-8, row-major)
const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],  // rows
  [0,3,6],[1,4,7],[2,5,8],  // cols
  [0,4,8],[2,4,6],          // diagonals
];

// Camera preset positions
const CAM_PRESETS = [
  { pos: new THREE.Vector3(0, 10, 12), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(12, 7,  0), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(-9, 11, 6), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(0, 16, .1), tgt: new THREE.Vector3(0, 0, 0) },
];
let camIdx = 0;

/* ════════════════════════════════════════════════════════
   GAME STATE
════════════════════════════════════════════════════════ */
let board       = Array(9).fill(null); // null | 'X' | 'O'
let turn        = 'X';
let over        = false;
let winLine     = [];
let scores      = { X: 0, O: 0, D: 0 };

/* ════════════════════════════════════════════════════════
   THREE.JS SETUP
════════════════════════════════════════════════════════ */
const wrap   = document.getElementById('canvas-wrap');
const canvas = document.getElementById('game-canvas');

// Renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080f);
scene.fog        = new THREE.FogExp2(0x06080f, 0.022);

// Camera
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
camera.position.copy(CAM_PRESETS[0].pos);
camera.lookAt(CAM_PRESETS[0].tgt);

// Lights ─────────────────────────────────────────────
const ambLight = new THREE.AmbientLight(0x1a2a44, 2.0);
scene.add(ambLight);

const dirLight = new THREE.DirectionalLight(0x7aaeff, 2.8);
dirLight.position.set(7, 14, 8);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.near = 1; dirLight.shadow.camera.far = 40;
dirLight.shadow.camera.left = -12; dirLight.shadow.camera.right = 12;
dirLight.shadow.camera.top  =  12; dirLight.shadow.camera.bottom = -12;
scene.add(dirLight);

const fillLight = new THREE.PointLight(0xe040fb, 1.0, 22);
fillLight.position.set(-6, 5, -4);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0x00e5ff, 0.7, 18);
rimLight.position.set(4, -1, 7);
scene.add(rimLight);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.07;
controls.minDistance     = 5;
controls.maxDistance     = 26;
controls.maxPolarAngle   = Math.PI * 0.84;
controls.target.set(0, 0, 0);

/* ════════════════════════════════════════════════════════
   BOARD — BoxGeometry 3×3 grid
════════════════════════════════════════════════════════ */
const boardGroup = new THREE.Group();
scene.add(boardGroup);

// Materials
const cellDefaultMat = new THREE.MeshStandardMaterial({
  color: 0x0d1a2e, metalness: 0.55, roughness: 0.45,
  emissive: 0x001122, emissiveIntensity: 0.3,
});
const cellHoverMat = new THREE.MeshStandardMaterial({
  color: 0x0a2a40, metalness: 0.6, roughness: 0.35,
  emissive: 0x003344, emissiveIntensity: 0.8,
});
const cellWinMat = new THREE.MeshStandardMaterial({
  color: 0x1a2a00, metalness: 0.5, roughness: 0.4,
  emissive: 0x334400, emissiveIntensity: 1.2,
});

const cellGeo = new THREE.BoxGeometry(CELL_W, CELL_H, CELL_W);

// Per-cell material instances (so we can change individually)
const cellMats  = [];
const cellMeshes = [];

for (let i = 0; i < 9; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x   = (col * STEP) - HALF;
  const z   = (row * STEP) - HALF;

  const mat  = cellDefaultMat.clone();
  cellMats.push(mat);

  // BoxGeometry cell — TRANSLATION applied here
  const mesh = new THREE.Mesh(cellGeo, mat);
  mesh.position.set(x, 0, z);          // ← Translation
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.userData.cellIndex = i;
  boardGroup.add(mesh);
  cellMeshes.push(mesh);
}

// Thin base platform under grid
const baseGeo = new THREE.BoxGeometry(COLS * STEP + 0.5, 0.08, COLS * STEP + 0.5);
const baseMat = new THREE.MeshStandardMaterial({
  color: 0x080e1c, metalness: 0.7, roughness: 0.6,
  emissive: 0x000611, emissiveIntensity: 0.4,
});
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.y = -CELL_H / 2 - 0.04;
base.receiveShadow = true;
boardGroup.add(base);

// Neon grid lines using LineSegments
(function buildGridLines() {
  const pts = [];
  const half = COLS * STEP / 2;
  // vertical separators
  for (let c = 1; c < COLS; c++) {
    const x = (c * STEP) - HALF - STEP / 2;
    pts.push(new THREE.Vector3(x, 0.15, -half), new THREE.Vector3(x, 0.15, half));
  }
  // horizontal separators
  for (let r = 1; r < COLS; r++) {
    const z = (r * STEP) - HALF - STEP / 2;
    pts.push(new THREE.Vector3(-half, 0.15, z), new THREE.Vector3(half, 0.15, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
  boardGroup.add(new THREE.LineSegments(geo, mat));
})();

/* ════════════════════════════════════════════════════════
   PIECES — GLTFLoader (x.glb / o.glb)
════════════════════════════════════════════════════════ */
const loader = new GLTFLoader();

let xTemplate = null; // cloned per placement
let oTemplate = null;

// Fallback procedural meshes (used if GLB fails to load)
function makeProceduralX() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xff4081, metalness: 0.7, roughness: 0.25,
    emissive: 0xff1155, emissiveIntensity: 0.35,
  });
  const barGeo = new THREE.BoxGeometry(0.22, 0.22, 1.2);
  const b1 = new THREE.Mesh(barGeo, mat); b1.rotation.y =  Math.PI / 4; b1.castShadow = true;
  const b2 = new THREE.Mesh(barGeo, mat); b2.rotation.y = -Math.PI / 4; b2.castShadow = true;
  g.add(b1, b2);
  return g;
}
function makeProceduralO() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x40c4ff, metalness: 0.65, roughness: 0.25,
    emissive: 0x0088cc, emissiveIntensity: 0.3,
  });
  const geo  = new THREE.TorusGeometry(0.52, 0.13, 16, 52);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = true;
  return mesh;
}

// Loading UI refs
const loadingEl = document.getElementById('loading');
const loadMsgEl = document.getElementById('load-msg');
const progFill  = document.getElementById('prog-fill');
let loadCount = 0;

function onOneLoaded() {
  loadCount++;
  progFill.style.width = (loadCount / 2 * 100) + '%';
  if (loadCount >= 2) {
    loadMsgEl.textContent = 'READY';
    setTimeout(() => loadingEl.classList.add('hide'), 500);
  }
}

function loadGLTF(path, onOk, label) {
  loadMsgEl.textContent = `LOADING ${label}…`;
  loader.load(path,
    (gltf) => {
      // Normalize scale so piece fits cell
      const model = gltf.scene;
      const box   = new THREE.Box3().setFromObject(model);
      const size  = box.getSize(new THREE.Vector3());
      const maxS  = Math.max(size.x, size.y, size.z);
      // O model gets extra scale-down (0.72) so it matches X visually
      const scaleFactor = label === 'O.GLB' ? 0.68 : 0.95;
      if (maxS > 0) model.scale.multiplyScalar(scaleFactor / maxS);

      model.traverse(c => {
        if (!c.isMesh) return;
        c.castShadow    = true;
        c.receiveShadow = true;
      });

      // Re-center model so its bottom sits at y=0 (aligns X and O heights)
      const box2  = new THREE.Box3().setFromObject(model);
      const minY  = box2.min.y;
      model.position.y -= minY;          // shift up so bottom = 0
      model.userData.heightOffset = 0;   // already bottom-aligned

      onOk(model);
      onOneLoaded();
    },
    (xhr) => {
      if (xhr.total) {
        const p = ((loadCount + xhr.loaded / xhr.total) / 2) * 100;
        progFill.style.width = p + '%';
      }
    },
    (err) => {
      console.warn(`GLTFLoader: ${path} failed (${err.message}). Using fallback.`);
      onOk(null);
      onOneLoaded();
    }
  );
}

loadGLTF('models/x.glb', (m) => { xTemplate = m; }, 'X.GLB');
loadGLTF('models/o.glb', (m) => { oTemplate = m; }, 'O.GLB');

/* ════════════════════════════════════════════════════════
   PIECE SPAWN SYSTEM
════════════════════════════════════════════════════════ */
const pieces   = {};          // cellIndex → THREE.Object3D
const spawning = [];          // { mesh, t, dur }  (scale 0→1 + spin)
const winning  = [];          // { mesh }           (continuous spin)

function spawnPiece(cellIndex) {
  let mesh;
  const isX = (turn === 'X');

  if (isX && xTemplate) {
    mesh = xTemplate.clone();
    const [col, emi] = getCurrentColors().x;
    applyPieceMat(mesh, col, emi);
  } else if (!isX && oTemplate) {
    mesh = oTemplate.clone();
    const [col, emi] = getCurrentColors().o;
    applyPieceMat(mesh, col, emi);
  } else {
    mesh = isX ? makeProceduralX() : makeProceduralO();
  }

  // ── TRANSLATION: place at cell center ──────────────
  const col = cellIndex % COLS;
  const row = Math.floor(cellIndex / COLS);
  mesh.position.set(
    (col * STEP) - HALF,       // x
    CELL_H / 2 + 0.18,         // y (sits on top of cell)
    (row * STEP) - HALF        // z
  );

  // ── SCALE: start at 0 for spawn animation ──────────
  mesh.scale.setScalar(0);
  mesh.userData.baseScale = 1;

  scene.add(mesh);
  pieces[cellIndex] = mesh;
  spawning.push({ mesh, t: 0, dur: 0.52 });
}

function applyPieceMat(obj, col, emi) {
  obj.traverse(c => {
    if (!c.isMesh) return;
    c.material = new THREE.MeshStandardMaterial({
      color: col, metalness: 0.65, roughness: 0.28,
      emissive: emi, emissiveIntensity: 0.35,
    });
    c.castShadow = true;
  });
}

/* ════════════════════════════════════════════════════════
   ANIMATION UPDATES
════════════════════════════════════════════════════════ */
const clock = new THREE.Clock();

function tickAnimations(dt) {
  // Spawn animation: scale 0→1 + slight rotation
  for (let i = spawning.length - 1; i >= 0; i--) {
    const a = spawning[i];
    a.t = Math.min(1, a.t + dt / a.dur);

    // Ease: cubic-out with overshoot
    const e = easeOvershoot(a.t);
    a.mesh.scale.setScalar(a.mesh.userData.baseScale * e);

    // ── ROTATION during spawn ───────────────────────
    a.mesh.rotation.y += dt * 5 * (1 - a.t);

    if (a.t >= 1) {
      a.mesh.scale.setScalar(a.mesh.userData.baseScale);
      spawning.splice(i, 1);
    }
  }

  // Win animation: continuous rotation + hover
  const t = performance.now() * 0.001;
  for (const a of winning) {
    // ── ROTATION for win pieces ──────────────────────
    a.mesh.rotation.y += dt * 2.4;
    a.mesh.position.y  = CELL_H / 2 + 0.18 + Math.sin(t * 2.5 + a.phase) * 0.12;
  }
}

function easeOvershoot(t) {
  if (t < 1) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  return 1;
}

/* ════════════════════════════════════════════════════════
   GAME LOGIC
════════════════════════════════════════════════════════ */
function checkWin() {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[b] === board[c])
      return combo;
  }
  return null;
}

function placePiece(idx) {
  if (board[idx] || over) return;

  board[idx] = turn;
  spawnPiece(idx);

  const win = checkWin();
  if (win) {
    winLine = win;
    over    = true;
    scores[turn]++;
    handleWin(win);
  } else if (board.every(v => v)) {
    over = true;
    scores.D++;
    handleDraw();
  } else {
    turn = turn === 'X' ? 'O' : 'X';
    updateStatusUI();
  }
}

function handleWin(combo) {
  // Highlight win cells
  combo.forEach((idx, i) => {
    cellMeshes[idx].material = cellWinMat.clone();
    const mesh = pieces[idx];
    if (mesh) {
      winning.push({ mesh, phase: i * 0.9 });
    }
  });

  setStatus(`PLAYER ${turn} WINS!`, 'win');
  showWinBanner(`PLAYER ${turn} WINS!`);
  updateScoreUI();

  // Camera — softer zoom toward win line center (not too close)
  const center = new THREE.Vector3();
  combo.forEach(i => {
    const m = cellMeshes[i];
    center.add(m.position);
  });
  center.divideScalar(3);
  center.y = 0;
  tweenCamera(
    center.clone().add(new THREE.Vector3(2, 10, 13)),   // was (1.5, 6, 7) — raised + pulled back
    center
  );
}

function handleDraw() {
  setStatus('DRAW — NO WINNER', 'draw');
  showWinBanner('DRAW!');
  updateScoreUI();
}

function resetGame() {
  // Remove all pieces from scene
  Object.values(pieces).forEach(m => scene.remove(m));
  for (const k in pieces) delete pieces[k];
  spawning.length = 0;
  winning.length  = 0;

  board    = Array(9).fill(null);
  turn     = 'X';
  over     = false;
  winLine  = [];
  hoveredIdx = -1;

  // Reset cell materials
  cellMeshes.forEach((m, i) => {
    cellMats[i] = cellDefaultMat.clone();
    m.material  = cellMats[i];
  });

  document.getElementById('win-flash').classList.remove('show');
  tweenCamera(CAM_PRESETS[0].pos, CAM_PRESETS[0].tgt);
  camIdx = 0;
  updateStatusUI();
}

/* ════════════════════════════════════════════════════════
   RAYCASTER — MOUSE CLICK & HOVER
════════════════════════════════════════════════════════ */
const raycaster = new THREE.Raycaster();
const mouse2    = new THREE.Vector2();
let   hoveredIdx = -1;

function getMouseNDC(e) {
  const r = canvas.getBoundingClientRect();
  mouse2.x =  (e.clientX - r.left) / r.width  * 2 - 1;
  mouse2.y = -(e.clientY - r.top)  / r.height * 2 + 1;
}

function hitCells() {
  raycaster.setFromCamera(mouse2, camera);
  return raycaster.intersectObjects(cellMeshes, false);
}

// HOVER interaction
canvas.addEventListener('mousemove', (e) => {
  getMouseNDC(e);
  const hits = hitCells();
  const newIdx = hits.length ? hits[0].object.userData.cellIndex : -1;

  if (newIdx !== hoveredIdx) {
    // Restore old
    if (hoveredIdx >= 0 && !winLine.includes(hoveredIdx)) {
      cellMeshes[hoveredIdx].material = board[hoveredIdx]
        ? cellDefaultMat.clone()
        : cellMats[hoveredIdx];
    }
    hoveredIdx = newIdx;
    // Apply hover
    if (newIdx >= 0 && !board[newIdx] && !over) {
      cellMeshes[newIdx].material = cellHoverMat.clone();
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'default';
    }
  }
});
canvas.addEventListener('mouseleave', () => {
  if (hoveredIdx >= 0 && !winLine.includes(hoveredIdx)) {
    cellMeshes[hoveredIdx].material = cellMats[hoveredIdx];
  }
  hoveredIdx = -1;
  canvas.style.cursor = 'default';
});

// CLICK interaction
canvas.addEventListener('click', (e) => {
  if (over) return;
  getMouseNDC(e);
  const hits = hitCells();
  if (hits.length) {
    const idx = hits[0].object.userData.cellIndex;
    if (!board[idx]) placePiece(idx);
  }
});

/* ════════════════════════════════════════════════════════
   KEYBOARD INTERACTION
════════════════════════════════════════════════════════ */
window.addEventListener('keydown', (e) => {
  switch (e.key.toUpperCase()) {
    case 'R': resetGame();    break;
    case 'C': cycleCamera();  break;
    case 'M': toggleMusic();  break;
    case ' ':
      e.preventDefault();
      cycleColors();
      break;
  }
});

/* ════════════════════════════════════════════════════════
   CAMERA TWEEN
════════════════════════════════════════════════════════ */
function tweenCamera(toPos, toTgt) {
  const fromPos = camera.position.clone();
  const fromTgt = controls.target.clone();
  let t = 0;
  (function step() {
    if (t >= 1) return;
    t = Math.min(1, t + 0.022);
    const e = 1 - Math.pow(1 - t, 3);
    camera.position.lerpVectors(fromPos, toPos, e);
    controls.target.lerpVectors(fromTgt, toTgt, e);
    controls.update();
    requestAnimationFrame(step);
  })();
}

function cycleCamera() {
  camIdx = (camIdx + 1) % CAM_PRESETS.length;
  const p = CAM_PRESETS[camIdx];
  tweenCamera(p.pos, p.tgt);
}

/* ════════════════════════════════════════════════════════
   UI HELPERS
════════════════════════════════════════════════════════ */
const statusMsg  = document.getElementById('status-msg');
const winFlash   = document.getElementById('win-flash');
const winBanner  = document.getElementById('win-banner');

function setStatus(text, cls = '') {
  statusMsg.textContent = text;
  statusMsg.className   = cls;
}

function updateStatusUI() {
  const cls = turn === 'X' ? 'x' : 'o';
  setStatus(`PLAYER ${turn}'S TURN`, cls);
}

function showWinBanner(text) {
  winBanner.textContent = text;
  winFlash.classList.add('show');
}

function updateScoreUI() {
  document.getElementById('score-x').textContent = `X  ${scores.X}`;
  document.getElementById('score-o').textContent = `O  ${scores.O}`;
  document.getElementById('score-d').textContent = `D  ${scores.D}`;
}

/* ════════════════════════════════════════════════════════
   HTML BUTTON
════════════════════════════════════════════════════════ */
document.getElementById('btn-restart').addEventListener('click', resetGame);
document.getElementById('btn-cam').addEventListener('click', cycleCamera);
document.getElementById('btn-music').addEventListener('click', toggleMusic);
window._toggleMusic = toggleMusic;

/* ════════════════════════════════════════════════════════
   BACKGROUND PARTICLES
════════════════════════════════════════════════════════ */
(function addParticles() {
  const N   = 250;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i*3]   = (Math.random() - .5) * 55;
    pos[i*3+1] = (Math.random() - .5) * 35;
    pos[i*3+2] = (Math.random() - .5) * 55;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0x00e5ff, size: 0.07, transparent: true, opacity: 0.45 });
  scene.add(new THREE.Points(geo, mat));
})();

/* ════════════════════════════════════════════════════════
   RESIZE
════════════════════════════════════════════════════════ */
function onResize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', onResize);
onResize();

/* ════════════════════════════════════════════════════════
   RENDER LOOP
════════════════════════════════════════════════════════ */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  controls.update();
  tickAnimations(dt);

  // Gentle board float
  boardGroup.position.y = Math.sin(performance.now() * .0006) * 0.07;

  // Pulse fill light
  fillLight.intensity = 1.0 + Math.sin(performance.now() * .0018) * 0.22;

  renderer.render(scene, camera);
}

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
updateStatusUI();
animate();
