import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { buildEnvironment } from './environment.js';
import { setupVR } from './vr.js';

// ---------------------------------------------------------
// 1. RENDERER, CAMERA, ENVIRONMENT
// ---------------------------------------------------------
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 50);
// Desktop start pose on the "dirty" side of the room. In VR the headset pose takes over.
camera.position.set(0.2, 1.6, 1.5);
camera.lookAt(0.2, 1.25, -2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

const env = buildEnvironment(scene, renderer);
let vr = null; // set up in section 6

// ---------------------------------------------------------
// 2. AUDIO SYNTHESIS & HAPTICS
// ---------------------------------------------------------
const listener = new THREE.AudioListener();
camera.add(listener);

function playTone(steps, type = 'sine', volume = 0.12, length = 0.3) {
    try {
        const ctx = THREE.AudioContext.getContext();
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        steps.forEach(([freq, at]) => osc.frequency.setValueAtTime(freq, ctx.currentTime + at));
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + length);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + length);
    } catch (e) {
        console.warn('AudioContext not available yet.', e);
    }
}

const playSuccessChime = () => playTone([[587.33, 0], [880, 0.1]]);            // D5 -> A5
const playViolationBuzz = () => playTone([[140, 0]], 'square', 0.06, 0.25);
const playPickup = () => playTone([[1046.5, 0]], 'sine', 0.05, 0.08);
const playClearedFanfare = () => playTone([[587.33, 0], [739.99, 0.12], [880, 0.24], [1174.66, 0.36]], 'triangle', 0.12, 0.7);

function pulse(controller, intensity = 0.5, duration = 100) {
    const actuator = controller?.userData.inputSource?.gamepad?.hapticActuators?.[0];
    if (actuator?.pulse) actuator.pulse(intensity, duration);
}

// ---------------------------------------------------------
// 3. PROTOCOL STATE MACHINE (strict, un-skippable order)
// ---------------------------------------------------------
const gowningSteps = [
    { id: 'shoe_covers',    short: 'Shoe Covers',  label: '1. Shoe Covers / Dedicated Booties',
      vr: 'Grab booties from the dispenser (grip), then reach down to your feet.' },
    { id: 'hair_cover',     short: 'Bouffant',     label: '2. Bouffant / Hair & Beard Cover',
      vr: 'Grab a bouffant and place it on top of your head.' },
    { id: 'gowning_suit',   short: 'Coverall',     label: '3. Lint-Free Coverall Suit',
      vr: 'Take a coverall from the rack and hold it against your chest.' },
    { id: 'face_mask',      short: 'Mask/Glasses', label: '4. Face Mask & Safety Glasses',
      vr: 'Grab a mask and glasses and bring them up to your face.' },
    { id: 'nitrile_gloves', short: 'Gloves',       label: '5. Cleanroom Nitrile Gloves',
      vr: 'Pull gloves from the box and bring them to your other hand.' },
    { id: 'esd_grounding',  short: 'ESD Strap',    label: '6. ESD Wrist Strap & Continuity Check', needsProximity: true,
      vr: 'Take the wrist strap from the tester and put it on your other wrist.' }
];

let currentStepIndex = 0;
let alertMessage = '';
let alertUntil = 0;

const isComplete = () => currentStepIndex >= gowningSteps.length;

function raiseAlert(msg) {
    alertMessage = msg;
    alertUntil = performance.now() + 3000;
    refreshAllUI();
}

// Is this the step the trainee is allowed to do now? Raises the violation if not.
function checkOrder(stepId, controller) {
    if (isComplete()) return false;
    const step = gowningSteps[currentStepIndex];
    if (step.id === stepId) return true;
    const attempted = gowningSteps.find((s) => s.id === stepId);
    const done = gowningSteps.indexOf(attempted) < currentStepIndex;
    raiseAlert(done ? `${attempted.short} already verified.` : `PROTOCOL VIOLATION: complete "${step.short}" first.`);
    if (!done) {
        playViolationBuzz();
        pulse(controller, 1.0, 250);
    }
    return false;
}

function attemptStep(stepId, controller) {
    if (!checkOrder(stepId, controller)) return;
    const step = gowningSteps[currentStepIndex];

    if (step.needsProximity && !checkUserProximity()) {
        raiseAlert('Stand on the ESD grounding mat to run the continuity check.');
        playViolationBuzz();
        pulse(controller, 1.0, 250);
        return;
    }

    currentStepIndex++;
    alertMessage = '';
    pulse(controller, 0.5, 100);
    if (isComplete()) playClearedFanfare(); else playSuccessChime();
    console.log(`Step passed: ${step.label}. Progress: ${currentStepIndex}/${gowningSteps.length}`);
    refreshAllUI();
}

function resetProtocol() {
    currentStepIndex = 0;
    alertMessage = '';
    refreshAllUI();
}

// ---------------------------------------------------------
// 4. WALL-MOUNTED TELEMETRY MONITOR
// ---------------------------------------------------------
const screenCanvas = document.createElement('canvas');
screenCanvas.width = 1024;
screenCanvas.height = 512;
const screenCtx = screenCanvas.getContext('2d');
const screenTexture = new THREE.CanvasTexture(screenCanvas);
screenTexture.colorSpace = THREE.SRGBColorSpace;

const monitor = new THREE.Group();
monitor.position.set(0, 2.55, env.room.minZ + 0.03);
const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.46, 0.04), new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.35 }));
monitor.add(bezel);
const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.41),
    new THREE.MeshStandardMaterial({ map: screenTexture, emissiveMap: screenTexture, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.15 })
);
screenMesh.position.z = 0.021;
monitor.add(screenMesh);
monitor.rotation.x = 0.12;
scene.add(monitor);

function drawTelemetry() {
    const c = screenCtx;
    const W = screenCanvas.width;
    const H = screenCanvas.height;
    c.fillStyle = '#002B49';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#FF6600';
    c.fillRect(0, 0, W, 10);

    c.fillStyle = '#FFFFFF';
    c.font = 'bold 40px sans-serif';
    c.fillText('VSU CLEANROOM & ESD PROTOCOL', 40, 70);

    const pct = currentStepIndex / gowningSteps.length;
    c.fillStyle = '#0b3d63';
    c.fillRect(40, 100, W - 80, 28);
    c.fillStyle = isComplete() ? '#10b981' : '#FF6600';
    c.fillRect(40, 100, (W - 80) * pct, 28);
    c.fillStyle = '#FFFFFF';
    c.font = '26px sans-serif';
    c.fillText(`Compliance Progress: ${currentStepIndex} / ${gowningSteps.length}`, 40, 165);

    gowningSteps.forEach((s, i) => {
        const y = 215 + i * 38;
        const done = i < currentStepIndex;
        const next = i === currentStepIndex;
        c.fillStyle = done ? '#10b981' : next ? '#FF6600' : '#94a3b8';
        c.fillText(`${done ? '✔' : next ? '▶' : '○'}  ${s.label}`, 40, y);
    });

    c.font = 'bold 30px sans-serif';
    if (alertMessage && performance.now() < alertUntil) {
        c.fillStyle = '#f87171';
        c.fillText(alertMessage, 40, H - 30);
    } else if (isComplete()) {
        c.fillStyle = '#10b981';
        c.fillText('STATUS: CLEARED FOR FABRICATION', 40, H - 30);
    } else {
        c.fillStyle = '#e2e8f0';
        c.fillText('STATUS: GOWNING IN PROGRESS', 40, H - 30);
    }
    screenTexture.needsUpdate = true;
}

// HTML overlay checklist (desktop view)
const hudList = document.getElementById('hud-list');
const hudAlert = document.getElementById('hud-alert');
function drawHud() {
    if (!hudList) return;
    hudList.innerHTML = gowningSteps
        .map((s, i) => `<li class="${i < currentStepIndex ? 'done' : i === currentStepIndex ? 'next' : ''}">${s.label}</li>`)
        .join('');
    const alertActive = alertMessage && performance.now() < alertUntil;
    if (alertActive) {
        hudAlert.style.color = '';
        hudAlert.textContent = alertMessage;
    } else if (isComplete()) {
        hudAlert.style.color = '#10b981';
        hudAlert.textContent = 'STATUS: CLEARED FOR FABRICATION';
    } else {
        hudAlert.textContent = '';
    }
}

// Station status LEDs: orange = pending, green = verified
function refreshStations() {
    env.stations.forEach((st) => {
        const i = gowningSteps.findIndex((s) => s.id === st.id);
        const done = i < currentStepIndex;
        st.led.material.emissive.setHex(done ? 0x22c55e : 0xff6600);
        st.led.material.color.setHex(done ? 0x0a3d1f : 0x331100);
    });
}

function refreshAllUI() {
    drawTelemetry();
    drawHud();
    refreshStations();
    vr?.applyState(currentStepIndex);
}

// Reset button under the monitor
const resetBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 0.03, 24),
    new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.35 })
);
resetBtn.rotation.x = Math.PI / 2;
resetBtn.position.set(0.55, 2.4, env.room.minZ + 0.02);
resetBtn.userData = { action: 'reset' };
scene.add(resetBtn);

// Floating marker over the next station
const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.045, 0.1, 24),
    new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 1.5 })
);
marker.rotation.x = Math.PI;
scene.add(marker);

// ---------------------------------------------------------
// 5. ESD PROXIMITY (auto continuity check on the mat)
// ---------------------------------------------------------
const ESD_HALF = 0.5;   // mat is 1 m x 1 m
const ESD_DWELL = 1.5;  // seconds on the mat before the check auto-passes
let esdDwell = 0;

const headPosition = new THREE.Vector3();
function checkUserProximity() {
    camera.getWorldPosition(headPosition);
    return Math.abs(headPosition.x - env.esdPos.x) <= ESD_HALF && Math.abs(headPosition.z - env.esdPos.z) <= ESD_HALF;
}

// ---------------------------------------------------------
// 6. INTERACTION: MOUSE + VR CONTROLLER LASERS
// ---------------------------------------------------------
const interactiveObjects = [...env.stations.flatMap((s) => [s.group, s.plate]), resetBtn];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(9, 9);

function pick() {
    const hit = raycaster.intersectObjects(interactiveObjects, true)[0];
    if (!hit) return null;
    const ud = hit.object.userData;
    return ud.stepId || ud.action ? { hit, ud } : null;
}

function handlePick(p, controller) {
    if (p.ud.action === 'reset') {
        resetProtocol();
        pulse(controller, 0.3, 60);
    } else if (p.ud.stepId) {
        attemptStep(p.ud.stepId, controller);
    }
}

renderer.domElement.addEventListener('click', (event) => {
    if (renderer.xr.isPresenting) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const p = pick();
    if (p) handlePick(p, null);
});

renderer.domElement.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Hands-on VR gowning (grab, carry, don), locomotion and hands live in vr.js
vr = setupVR({
    renderer, scene, camera, env, steps: gowningSteps,
    api: {
        extraInteractive: [resetBtn],
        checkOrder,
        complete: attemptStep,
        alert: (msg, controller) => { raiseAlert(msg); playViolationBuzz(); pulse(controller, 0.8, 150); },
        getAlert: () => (alertMessage && performance.now() < alertUntil ? alertMessage : ''),
        pulse,
        onMat: () => checkUserProximity(),
        playPickup,
        action: (name, controller) => { if (name === 'reset') { resetProtocol(); pulse(controller, 0.3, 60); } }
    }
});

// ---------------------------------------------------------
// 7. DESKTOP WALK CONTROLS (WASD / arrows)
// ---------------------------------------------------------
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
function updateDesktopMovement(dt) {
    if (renderer.xr.isPresenting) return;
    const speed = 1.5 * dt;
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    right.crossVectors(forward, camera.up).normalize();
    if (keys.has('w') || keys.has('arrowup')) camera.position.addScaledVector(forward, speed);
    if (keys.has('s') || keys.has('arrowdown')) camera.position.addScaledVector(forward, -speed);
    if (keys.has('d')) camera.position.addScaledVector(right, speed);
    if (keys.has('a')) camera.position.addScaledVector(right, -speed);
    if (keys.has('arrowleft')) camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, 1.5 * dt);
    if (keys.has('arrowright')) camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, -1.5 * dt);
    // Keep inside the room
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, env.room.minX + 0.3, env.room.maxX - 0.3);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, env.room.minZ + 0.3, env.room.maxZ - 0.3);
}

// ---------------------------------------------------------
// 8. RENDER LOOP
// ---------------------------------------------------------
refreshAllUI();

const clock = new THREE.Clock();
let alertWasActive = false;

renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    updateDesktopMovement(dt);

    // Technicians working in the lithography bay
    env.technicians.forEach((p) => {
        const ph = p.userData.phase;
        p.position.y = Math.sin(t * 1.1 + ph) * 0.008;
        p.userData.armR.rotation.x = -0.7 + Math.sin(t * 1.6 + ph) * 0.25;
        p.userData.armL.rotation.x = -0.5 + Math.sin(t * 1.3 + ph + 1) * 0.15;
    });

    // Marker bobbing over the next station
    const next = env.stations.find((s) => s.id === gowningSteps[currentStepIndex]?.id);
    marker.visible = !!next;
    if (next) {
        marker.position.copy(next.anchor);
        marker.position.y += Math.sin(t * 3) * 0.03;
        marker.rotation.y = t * 1.5;
    }

    // ESD mat: glow and auto-verify after standing still on it
    const onMat = checkUserProximity();
    const esdIsNext = gowningSteps[currentStepIndex]?.id === 'esd_grounding';
    // In VR the strap must actually be on your wrist first
    const canDwell = !renderer.xr.isPresenting || vr.strapOn;
    esdDwell = onMat && esdIsNext && canDwell ? esdDwell + dt : 0;
    env.esdMatMaterial.emissive.setHex(onMat && esdIsNext ? (Math.sin(t * 10) > 0 ? 0x0f5132 : 0x072a1a) : 0x000000);
    if (esdDwell >= ESD_DWELL) {
        esdDwell = 0;
        attemptStep('esd_grounding', null);
    }

    // VR hands, grabbing, donning, locomotion; mouse hover on desktop
    vr.update(dt, t);
    if (!renderer.xr.isPresenting) {
        raycaster.setFromCamera(pointer, camera);
        renderer.domElement.style.cursor = pick() ? 'pointer' : 'default';
    }

    const alertActive = alertMessage && performance.now() < alertUntil;
    if (alertWasActive && !alertActive) {
        alertMessage = '';
        refreshAllUI();
    }
    alertWasActive = !!alertActive;

    renderer.render(scene, camera);
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug hook for testing in the browser console
window.__vsu = { camera, vr, attemptStep, resetProtocol, get step() { return currentStepIndex; }, get alert() { return alertMessage; } };
