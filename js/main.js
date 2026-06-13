import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader }    from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

//MUSIC SISTEM

const audio = new Audio();
audio.loop   = true;
audio.volume = 0.45;

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
  if (!musicLoaded) { showToast('1975.mp3'); return; }
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

// WARNA WARNI SISTEM

const RAINBOW_PALETTE = [
  { x: [0xff4081, 0xff1155], o: [0x40c4ff, 0x0088cc] },
  { x: [0xff6d00, 0xdd4400], o: [0x00e676, 0x00994d] },
  { x: [0xffea00, 0xcc9900], o: [0xaa00ff, 0x6600cc] },
  { x: [0x00e5ff, 0x0088bb], o: [0xff1744, 0xcc0022] },
  { x: [0x69ff47, 0x33cc00], o: [0xff80ab, 0xcc0066] },
  { x: [0xffd740, 0xcc8800], o: [0x40c4ff, 0x0055cc] },
];
let paletteIdx = 0;

function cycleColors() {
  paletteIdx = (paletteIdx + 1) % RAINBOW_PALETTE.length;
  const pal = RAINBOW_PALETTE[paletteIdx];
  for (const [idx, mesh] of Object.entries(pieces)) {
    const isX = board[idx] === 'X';
    const [col, emi] = isX ? pal.x : pal.o;
    applyPieceMat(mesh, col, emi);
  }
  showToast(`🎨 Color theme ${paletteIdx + 1}/${RAINBOW_PALETTE.length}`);
}

function getCurrentColors() {
  return RAINBOW_PALETTE[paletteIdx];
}

// CONSTANT

const COLS      = 3;
const CELL_W    = 2.4;
const CELL_H    = 0.22;
const GAP       = 0.08;
const STEP      = CELL_W + GAP;
const HALF      = (COLS - 1) / 2 * STEP;

const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

const CAM_PRESETS = [
  { pos: new THREE.Vector3(0, 10, 12), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(12, 7,  0), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(-9, 11, 6), tgt: new THREE.Vector3(0, 0, 0) },
  { pos: new THREE.Vector3(0, 16, .1), tgt: new THREE.Vector3(0, 0, 0) },
];
let camIdx = 0;

//GAME STATE

let board   = Array(9).fill(null);
let turn    = 'X';
let over    = false;
let winLine = [];
let scores  = { X: 0, O: 0, D: 0 };

   //THREE.JS SETUP

const wrap   = document.getElementById('canvas-wrap');
const canvas = document.getElementById('game-canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x06080f);
scene.fog        = new THREE.FogExp2(0x06080f, 0.022);

const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
camera.position.copy(CAM_PRESETS[0].pos);
camera.lookAt(CAM_PRESETS[0].tgt);

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

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.07;
controls.minDistance     = 5;
controls.maxDistance     = 26;
controls.maxPolarAngle   = Math.PI * 0.84;
controls.target.set(0, 0, 0);


   //PAPAN

const boardGroup = new THREE.Group();
scene.add(boardGroup);

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
const cellMats  = [];
const cellMeshes = [];

for (let i = 0; i < 9; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x   = (col * STEP) - HALF;
  const z   = (row * STEP) - HALF;
  const mat  = cellDefaultMat.clone();
  cellMats.push(mat);
  const mesh = new THREE.Mesh(cellGeo, mat);
  mesh.position.set(x, 0, z);
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  mesh.userData.cellIndex = i;
  boardGroup.add(mesh);
  cellMeshes.push(mesh);
}

const baseGeo = new THREE.BoxGeometry(COLS * STEP + 0.5, 0.08, COLS * STEP + 0.5);
const baseMat = new THREE.MeshStandardMaterial({
  color: 0x080e1c, metalness: 0.7, roughness: 0.6,
  emissive: 0x000611, emissiveIntensity: 0.4,
});
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.y = -CELL_H / 2 - 0.04;
base.receiveShadow = true;
boardGroup.add(base);

(function buildGridLines() {
  const pts = [];
  const half = COLS * STEP / 2;
  for (let c = 1; c < COLS; c++) {
    const x = (c * STEP) - HALF - STEP / 2;
    pts.push(new THREE.Vector3(x, 0.15, -half), new THREE.Vector3(x, 0.15, half));
  }
  for (let r = 1; r < COLS; r++) {
    const z = (r * STEP) - HALF - STEP / 2;
    pts.push(new THREE.Vector3(-half, 0.15, z), new THREE.Vector3(half, 0.15, z));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6 });
  boardGroup.add(new THREE.LineSegments(geo, mat));
})();

   //PIECES — GLTFLoader

const loader = new GLTFLoader();

let xTemplate = null;
let oTemplate = null;

// Simpan center Y tiap model supaya bisa di-offset saat spawn
let xCenterY = 0;
let oCenterY = 0;

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
      const model = gltf.scene;

      // Normalisasi scale supaya muat di cell
      const box  = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxS = Math.max(size.x, size.y, size.z);
      const scaleFactor = label === 'O.GLB' ? 0.95 : 0.95;
      if (maxS > 0) model.scale.multiplyScalar(scaleFactor / maxS);

      model.traverse(c => {
        if (!c.isMesh) return;
        c.castShadow    = true;
        c.receiveShadow = true;
      });

      // Hitung center Y setelah scale — dipakai saat spawn buat sejajarkan tinggi
      const box2   = new THREE.Box3().setFromObject(model);
      const centerY = (box2.min.y + box2.max.y) / 2;

      // Simpan centerY per model, tidak geser position di sini
      if (label === 'X.GLB') xCenterY = centerY;
      else                    oCenterY = centerY;

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


   //objek SPAWN SYSTEM

const pieces   = {};
const spawning = [];
const winning  = [];

// Y dasar tempat semua objek duduk di atas cell
const BASE_Y = CELL_H / 5 + 0.95;

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

  const col = cellIndex % COLS;
  const row = Math.floor(cellIndex / COLS);

  // Offset Y: geser ke atas sebesar centerY supaya titik tengah model
  // selalu duduk di BASE_Y yang sama antara X dan O
  const centerY = isX ? xCenterY : oCenterY;

  mesh.position.set(
    (col * STEP) - HALF,
    BASE_Y - centerY,        // ← sejajarkan berdasarkan center model
    (row * STEP) - HALF
  );

  // Simpan scale asli dari loadGLTF sebelum di-reset ke 0
  const currentScale = mesh.scale.x;
  mesh.scale.setScalar(0);
  mesh.userData.baseScale  = currentScale > 0 ? currentScale : 1;
  mesh.userData.spawnBaseY = BASE_Y - centerY; // simpan Y asli untuk animasi win

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
  for (let i = spawning.length - 1; i >= 0; i--) {
    const a = spawning[i];
    a.t = Math.min(1, a.t + dt / a.dur);
    const e = easeOvershoot(a.t);
    a.mesh.scale.setScalar(a.mesh.userData.baseScale * e);
    a.mesh.rotation.y += dt * 5 * (1 - a.t);
    if (a.t >= 1) {
      a.mesh.scale.setScalar(a.mesh.userData.baseScale);
      spawning.splice(i, 1);
    }
  }

  const t = performance.now() * 0.001;
  for (const a of winning) {
    a.mesh.rotation.y += dt * 2.4;
    // Pakai spawnBaseY supaya hover animasi juga sejajar
    const baseY = a.mesh.userData.spawnBaseY ?? BASE_Y;
    a.mesh.position.y = baseY + Math.sin(t * 2.5 + a.phase) * 0.12;
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
  combo.forEach((idx, i) => {
    cellMeshes[idx].material = cellWinMat.clone();
    const mesh = pieces[idx];
    if (mesh) winning.push({ mesh, phase: i * 0.9 });
  });
  setStatus(`PLAYER ${turn} WINS!`, 'win');
  showWinBanner(`PLAYER ${turn} WINS!`);
  updateScoreUI();
  const center = new THREE.Vector3();
  combo.forEach(i => center.add(cellMeshes[i].position));
  center.divideScalar(3);
  center.y = 0;
  tweenCamera(center.clone().add(new THREE.Vector3(+8, 6, +1)), center);
}

function handleDraw() {
  setStatus('DRAW — NO WINNER', 'draw');
  showWinBanner('DRAW!');
  updateScoreUI();
}

function resetGame() {
  Object.values(pieces).forEach(m => scene.remove(m));
  for (const k in pieces) delete pieces[k];
  spawning.length = 0;
  winning.length  = 0;
  board      = Array(9).fill(null);
  turn       = 'X';
  over       = false;
  winLine    = [];
  hoveredIdx = -1;
  cellMeshes.forEach((m, i) => {
    cellMats[i] = cellDefaultMat.clone();
    m.material  = cellMats[i];
  });
  document.getElementById('win-flash').classList.remove('show');
  tweenCamera(CAM_PRESETS[0].pos, CAM_PRESETS[0].tgt);
  camIdx = 0;
  updateStatusUI();
}

   //RAYCASTER

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

canvas.addEventListener('mousemove', (e) => {
  getMouseNDC(e);
  const hits = hitCells();
  const newIdx = hits.length ? hits[0].object.userData.cellIndex : -1;
  if (newIdx !== hoveredIdx) {
    if (hoveredIdx >= 0 && !winLine.includes(hoveredIdx)) {
      cellMeshes[hoveredIdx].material = board[hoveredIdx]
        ? cellDefaultMat.clone()
        : cellMats[hoveredIdx];
    }
    hoveredIdx = newIdx;
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
canvas.addEventListener('click', (e) => {
  if (over) return;
  getMouseNDC(e);
  const hits = hitCells();
  if (hits.length) {
    const idx = hits[0].object.userData.cellIndex;
    if (!board[idx]) placePiece(idx);
  }
});

   //KEYBOARD

window.addEventListener('keydown', (e) => {
  switch (e.key.toUpperCase()) {
    case 'R': resetGame();   break;
    case 'C': cycleCamera(); break;
    case 'M': toggleMusic(); break;
    case ' ':
      e.preventDefault();
      cycleColors();
      break;
  }
});

   //CAMERA TWEEN

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


  //UI HELPERS

const statusMsg = document.getElementById('status-msg');
const winFlash  = document.getElementById('win-flash');
const winBanner = document.getElementById('win-banner');

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

   //HTML BUTTONS

document.getElementById('btn-restart').addEventListener('click', resetGame);
document.getElementById('btn-cam').addEventListener('click', cycleCamera);
document.getElementById('btn-music').addEventListener('click', toggleMusic);
window._toggleMusic = toggleMusic;

  //BACKGROUND PARTICLES

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

   //RESIZE

function onResize() {
  const w = wrap.clientWidth, h = wrap.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
window.addEventListener('resize', onResize);
onResize();

   //RENDER LOOP

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  controls.update();
  tickAnimations(dt);
  boardGroup.position.y = Math.sin(performance.now() * .0006) * 0.07;
  fillLight.intensity = 1.0 + Math.sin(performance.now() * .0018) * 0.22;
  renderer.render(scene, camera);
}


   //INIT

updateStatusUI();
animate();
