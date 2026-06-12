import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Konfigurasi Dasar ---
const canvasContainer = document.getElementById('canvas-container');
const statusText = document.getElementById('status');
const restartBtn = document.getElementById('restart-btn');

let scene, camera, renderer, controls;
let raycaster, mouse;
let modelXTemplate, modelOTemplate;

// Variabel penyimpan skala otomatis
let scaleX = 1;
let scaleO = 1;

// --- State Permainan ---
let gameBoard = [
    ['', '', ''],
    ['', '', ''],
    ['', '', '']
];
let currentPlayer = 'X';
let gameOver = false;
let placedPieces = []; 
let animatingSpawns = []; 
let winningPieces = []; 

const cellSize = 2.2; 
const hitBoxes = []; 
let hoveredHitbox = null;

const cameraPositions = [
    new THREE.Vector3(0, 8, 8),   
    new THREE.Vector3(0, 12, 0),  
    new THREE.Vector3(8, 5, 8)    
];
let currentCameraIndex = 0;
let targetCameraPos = cameraPositions[0].clone();
let targetCameraLookAt = new THREE.Vector3(0, 0, 0);

init();
animate();

function init() {
    // 1. Scene Setup (PAKSA BACKGROUND JADI GELAP)
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Warna biru tua/ungu gelap
    
    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.copy(cameraPositions[currentCameraIndex]);
    
    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    canvasContainer.appendChild(renderer.domElement);
    
    // 4. Lights Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // 6. Raycaster & Mouse
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    // 7. Event Listeners
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onMouseClick);
    window.addEventListener('keydown', onKeyDown);
    restartBtn.addEventListener('click', resetGame);

    // 8. Buat Objek
    createBoard();    
    createHitboxes(); 
    loadModels();     
}

function createBoard() {
    const boardGroup = new THREE.Group();
    
    const lineMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a2e,
        emissive: 0x00f2fe,
        emissiveIntensity: 0.6,
        metalness: 0.8, 
        roughness: 0.2 
    });

    const length = cellSize * 3; 
    const thickness = 0.15;
    const depth = 0.2;

    const geoHorizontal = new THREE.BoxGeometry(length, depth, thickness);
    const geoVertical = new THREE.BoxGeometry(thickness, depth, length);
    const offset = cellSize / 2;

    const hLine1 = new THREE.Mesh(geoHorizontal, lineMaterial);
    hLine1.position.set(0, 0, -offset);
    hLine1.castShadow = true;
    boardGroup.add(hLine1);

    const hLine2 = new THREE.Mesh(geoHorizontal, lineMaterial);
    hLine2.position.set(0, 0, offset);
    hLine2.castShadow = true;
    boardGroup.add(hLine2);

    const vLine1 = new THREE.Mesh(geoVertical, lineMaterial);
    vLine1.position.set(-offset, 0, 0);
    vLine1.castShadow = true;
    boardGroup.add(vLine1);

    const vLine2 = new THREE.Mesh(geoVertical, lineMaterial);
    vLine2.position.set(offset, 0, 0);
    vLine2.castShadow = true;
    boardGroup.add(vLine2);

    scene.add(boardGroup);
}

function loadModels() {
    const loader = new GLTFLoader();

    loader.load('models/x.glb', (gltf) => {
        modelXTemplate = gltf.scene;
        
        // AUTO-SCALE BINTANG (X)
        const box = new THREE.Box3().setFromObject(modelXTemplate);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        scaleX = 1.4 / maxDim; // Paksa ukuran maksimal menjadi 1.4 (pas dalam grid)

        modelXTemplate.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    });

    loader.load('models/o.glb', (gltf) => {
        modelOTemplate = gltf.scene;
        
        // AUTO-SCALE JAMUR (O)
        const box = new THREE.Box3().setFromObject(modelOTemplate);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        scaleO = 1.4 / maxDim; // Paksa ukuran maksimal menjadi 1.4 (pas dalam grid)

        modelOTemplate.traverse((child) => { if (child.isMesh) child.castShadow = true; });
    });
}

function createHitboxes() {
    const geometry = new THREE.PlaneGeometry(cellSize * 0.9, cellSize * 0.9);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x00f2fe, 
        transparent: true, 
        opacity: 0.0, 
        side: THREE.DoubleSide 
    });

    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
            const hitbox = new THREE.Mesh(geometry, material.clone());
            hitbox.rotation.x = -Math.PI / 2;
            
            const posX = (col - 1) * cellSize;
            const posZ = (row - 1) * cellSize;
            
            hitbox.position.set(posX, 0.1, posZ);
            hitbox.userData = { row, col }; 
            scene.add(hitbox);
            hitBoxes.push(hitbox);
        }
    }
}

function onMouseMove(event) {
    if (gameOver) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(hitBoxes);

    if (hoveredHitbox) {
        hoveredHitbox.material.opacity = 0.0;
        hoveredHitbox = null;
    }

    if (intersects.length > 0) {
        const hitbox = intersects[0].object;
        const { row, col } = hitbox.userData;
        
        if (gameBoard[row][col] === '') {
            hitbox.material.opacity = 0.2;
            hoveredHitbox = hitbox;
        }
    }
}

function onMouseClick() {
    if (gameOver || !hoveredHitbox || !modelXTemplate || !modelOTemplate) return;

    const { row, col } = hoveredHitbox.userData;
    
    if (gameBoard[row][col] === '') {
        placeSymbol(row, col, hoveredHitbox.position);
        checkWinState();
        
        if (!gameOver) {
            currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
            updateStatusText();
        }
    }
}

function placeSymbol(row, col, position) {
    gameBoard[row][col] = currentPlayer;
    
    const template = currentPlayer === 'X' ? modelXTemplate : modelOTemplate;
    const piece = template.clone();
    
    piece.position.copy(position);
    piece.scale.set(0, 0, 0); // Mulai dari 0 untuk animasi
    
    // Berikan skala target sesuai hitungan otomatis (bukan 1)
    const target = currentPlayer === 'X' ? scaleX : scaleO;
    piece.userData = { targetScale: target, type: currentPlayer };
    
    scene.add(piece);
    placedPieces.push(piece);
    animatingSpawns.push(piece);
    
    hoveredHitbox.material.opacity = 0;
    hoveredHitbox = null;
}

function checkWinState() {
    const winConditions = [
        [[0,0], [0,1], [0,2]], [[1,0], [1,1], [1,2]], [[2,0], [2,1], [2,2]], 
        [[0,0], [1,0], [2,0]], [[0,1], [1,1], [2,1]], [[0,2], [1,2], [2,2]], 
        [[0,0], [1,1], [2,2]], [[0,2], [1,1], [2,0]]                         
    ];

    for (let condition of winConditions) {
        const [a, b, c] = condition;
        const val1 = gameBoard[a[0]][a[1]];
        const val2 = gameBoard[b[0]][b[1]];
        const val3 = gameBoard[c[0]][c[1]];

        if (val1 !== '' && val1 === val2 && val2 === val3) {
            triggerWin(val1, condition);
            return;
        }
    }

    const isDraw = gameBoard.flat().every(cell => cell !== '');
    if (isDraw) {
        gameOver = true;
        statusText.innerText = "PERMAINAN SERI!";
        statusText.style.color = "#ffffff";
    }
}

function triggerWin(winner, condition) {
    gameOver = true;
    statusText.innerText = `PEMAIN ${winner} MENANG!`;
    statusText.style.color = winner === 'X' ? '#00f2fe' : '#fe006a';

    winningPieces = placedPieces.filter(piece => {
        let match = false;
        condition.forEach(([row, col]) => {
            const posX = (col - 1) * cellSize;
            const posZ = (row - 1) * cellSize;
            if (Math.abs(piece.position.x - posX) < 0.1 && Math.abs(piece.position.z - posZ) < 0.1) {
                match = true;
            }
        });
        return match;
    });

    const centerX = winningPieces.reduce((sum, p) => sum + p.position.x, 0) / 3;
    const centerZ = winningPieces.reduce((sum, p) => sum + p.position.z, 0) / 3;
    
    targetCameraLookAt.set(centerX, 0, centerZ);
    targetCameraPos.set(centerX, 4, centerZ + 4);
}

function updateStatusText() {
    statusText.innerText = `Giliran: Pemain ${currentPlayer}`;
    statusText.style.color = currentPlayer === 'X' ? '#00f2fe' : '#fe006a';
}

function onKeyDown(event) {
    if (event.key.toLowerCase() === 'r') {
        resetGame();
    } else if (event.key.toLowerCase() === 'c') {
        currentCameraIndex = (currentCameraIndex + 1) % cameraPositions.length;
        if (!gameOver) {
            targetCameraPos.copy(cameraPositions[currentCameraIndex]);
        }
    }
}

function resetGame() {
    placedPieces.forEach(piece => scene.remove(piece));
    placedPieces = [];
    winningPieces = [];
    animatingSpawns = [];
    
    gameBoard = [
        ['', '', ''],
        ['', '', ''],
        ['', '', '']
    ];
    currentPlayer = 'X';
    gameOver = false;
    
    targetCameraPos.copy(cameraPositions[currentCameraIndex]);
    targetCameraLookAt.set(0,0,0);
    controls.target.copy(targetCameraLookAt);
    
    updateStatusText();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    // Animasi Scale disesuaikan dengan skala otomatis target
    for (let i = animatingSpawns.length - 1; i >= 0; i--) {
        const piece = animatingSpawns[i];
        const target = piece.userData.targetScale;
        const speed = target * 0.15; // 15% dari target scale per frame
        
        if (piece.scale.x < target * 0.95) { 
            piece.scale.addScalar(speed); 
            piece.rotation.y += 0.2;     
        } else {
            piece.scale.set(target, target, target);
            piece.rotation.y = 0;        
            animatingSpawns.splice(i, 1);
        }
    }

    if (gameOver && winningPieces.length > 0) {
        winningPieces.forEach(piece => {
            piece.rotation.y += 0.05; 
        });
        
        camera.position.lerp(targetCameraPos, 0.02);
        controls.target.lerp(targetCameraLookAt, 0.02);
    } else if (!gameOver) {
        camera.position.lerp(targetCameraPos, 0.05);
    }

    controls.update();
    renderer.render(scene, camera);
}
