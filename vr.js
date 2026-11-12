// Hands-on VR gowning: grab garments with the controllers and put them on your body.
//
//   grip (squeeze) near a dispenser  -> item appears in your hand
//   trigger while pointing at one    -> same, from a distance
//   carry it to the right body zone  -> it is donned automatically
//   let go anywhere else             -> it falls to the floor (contaminated)
//
// Also: player rig with thumbstick locomotion + snap turn, mitten hands that
// change as you gown (sleeve cuffs, nitrile gloves, ESD strap), booties at your
// feet, and a wrist display with the current instruction.
import * as THREE from 'three';

const SKIN = 0xc9a183;
const NITRILE = 0x5b6ee1;
const UP = new THREE.Vector3(0, 1, 0);

const M = {
    blue: new THREE.MeshPhysicalMaterial({ color: 0x4f8fd8, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0xbcd7ff) }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf6f8fa, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffffff) }),
    pack: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35 }),
    vsuBlue: new THREE.MeshStandardMaterial({ color: 0x002B49, roughness: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.45 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xd9dde1, metalness: 1, roughness: 0.3 }),
    glove: new THREE.MeshStandardMaterial({ color: NITRILE, roughness: 0.5 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false })
};

const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
};

// ---------------------------------------------------------------
// Garments that appear in the hand
// ---------------------------------------------------------------
function makeItem(stepId) {
    const g = new THREE.Group();
    switch (stepId) {
        case 'shoe_covers':
            for (const s of [-1, 1]) {
                mesh(new THREE.SphereGeometry(0.06, 16, 10), M.blue, g, s * 0.045, 0, 0).scale.set(0.8, 0.45, 1.6);
            }
            break;
        case 'hair_cover': {
            mesh(new THREE.SphereGeometry(0.09, 20, 12), M.white, g).scale.set(1, 0.35, 1);
            const edge = mesh(new THREE.TorusGeometry(0.085, 0.009, 8, 32), M.white, g);
            edge.rotation.x = Math.PI / 2;
            break;
        }
        case 'gowning_suit':
            mesh(new THREE.BoxGeometry(0.22, 0.06, 0.3), M.pack, g);
            mesh(new THREE.BoxGeometry(0.222, 0.018, 0.302), M.vsuBlue, g, 0, 0.012, 0);
            break;
        case 'face_mask':
            mesh(new THREE.SphereGeometry(0.07, 16, 10), M.white, g).scale.set(1.1, 0.7, 0.5);
            mesh(new THREE.BoxGeometry(0.15, 0.045, 0.004), M.lens, g, 0, 0.065, 0.02);
            mesh(new THREE.BoxGeometry(0.155, 0.01, 0.012), M.black, g, 0, 0.09, 0.02);
            break;
        case 'nitrile_gloves':
            for (const s of [-1, 1]) {
                const glove = new THREE.Group();
                glove.position.set(s * 0.035, s * 0.006, 0);
                g.add(glove);
                mesh(new THREE.BoxGeometry(0.06, 0.012, 0.08), M.glove, glove);
                for (let f = 0; f < 4; f++) {
                    const fi = mesh(new THREE.CapsuleGeometry(0.007, 0.045, 4, 8), M.glove, glove, -0.022 + f * 0.0147, 0, -0.065);
                    fi.rotation.x = -Math.PI / 2;
                }
            }
            break;
        case 'esd_grounding': {
            mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 28), M.black, g);
            mesh(new THREE.BoxGeometry(0.022, 0.014, 0.02), M.steel, g, 0, -0.04, 0);
            const cord = mesh(new THREE.TorusKnotGeometry(0.018, 0.003, 48, 6, 2, 7), M.black, g, 0, -0.08, 0);
            cord.scale.set(0.8, 1.8, 0.8);
            break;
        }
    }
    return g;
}

// ---------------------------------------------------------------
// Stylised mitten hand that follows the controller grip
// ---------------------------------------------------------------
function makeHand(handedness) {
    const s = handedness === 'left' ? 1 : -1; // thumb side
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
    const fist = mesh(new THREE.CapsuleGeometry(0.038, 0.045, 6, 14), skin, g, 0, 0, 0.01);
    fist.rotation.x = Math.PI / 2;
    fist.scale.x = 0.75;
    const thumbPivot = new THREE.Group();
    thumbPivot.position.set(s * 0.028, 0.018, 0.0);
    thumbPivot.rotation.y = s * 0.45;
    g.add(thumbPivot);
    mesh(new THREE.CapsuleGeometry(0.012, 0.035, 4, 10), skin, thumbPivot, 0, 0, -0.03).rotation.x = -Math.PI / 2;
    const wrist = mesh(new THREE.CapsuleGeometry(0.03, 0.08, 4, 12), skin, g, 0, 0, 0.1);
    wrist.rotation.x = Math.PI / 2;
    wrist.scale.x = 0.85;

    // Coverall sleeve cuff (appears after step 3)
    const cuff = mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.16, 18, 1, true), M.white, g, 0, 0, 0.17);
    cuff.rotation.x = Math.PI / 2;
    cuff.material = M.white.clone();
    cuff.material.side = THREE.DoubleSide;
    cuff.visible = false;

    // ESD wrist strap (appears when donned)
    const strap = new THREE.Group();
    strap.position.z = 0.085;
    mesh(new THREE.TorusGeometry(0.038, 0.007, 8, 28), M.black, strap);
    mesh(new THREE.BoxGeometry(0.02, 0.014, 0.02), M.steel, strap, 0, 0.042, 0);
    strap.visible = false;
    g.add(strap);

    return { group: g, skin, cuff, strap };
}

// ---------------------------------------------------------------
// Main setup
// ---------------------------------------------------------------
export function setupVR({ renderer, scene, camera, env, steps, api }) {
    const rig = new THREE.Group();
    rig.name = 'player-rig';
    scene.add(rig);
    rig.add(camera);

    const head = new THREE.Vector3();
    const fwd = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const tmp2 = new THREE.Vector3();
    const tempMatrix = new THREE.Matrix4();
    const raycaster = new THREE.Raycaster();

    let strapOn = false;
    let strapHand = null;
    let stepIndex = 0;

    // Grab volumes around each station prop (static, computed once)
    scene.updateMatrixWorld(true);
    const stationBoxes = env.stations.map((st) => ({
        id: st.id,
        box: new THREE.Box3().setFromObject(st.group).expandByScalar(0.12)
    }));
    const esdStation = env.stations.find((s) => s.id === 'esd_grounding');
    const testerPos = new THREE.Vector3();
    esdStation.group.getWorldPosition(testerPos);

    const interactive = [...env.stations.flatMap((s) => [s.group, s.plate]), ...(api.extraInteractive || [])];

    // Target ghost that shows where the held item must go
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.25, depthWrite: false });
    const ghost = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), ghostMat);
    ghost.visible = false;
    scene.add(ghost);
    const ghostRing = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 40), ghostMat);
    ghostRing.rotation.x = -Math.PI / 2;
    ghostRing.visible = false;
    scene.add(ghostRing);

    // Booties at your feet once step 1 is done (visible when you look down)
    const feet = new THREE.Group();
    for (const s of [-1, 1]) {
        mesh(new THREE.SphereGeometry(0.07, 16, 10), M.blue, feet, s * 0.11, 0.045, 0.02).scale.set(0.85, 0.6, 1.7);
    }
    feet.visible = false;
    scene.add(feet);

    // Wrist display (left hand) with the current instruction
    const wristCanvas = document.createElement('canvas');
    wristCanvas.width = 512;
    wristCanvas.height = 256;
    const wristTex = new THREE.CanvasTexture(wristCanvas);
    wristTex.colorSpace = THREE.SRGBColorSpace;
    const wristPanel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.075),
        new THREE.MeshBasicMaterial({ map: wristTex, transparent: true, toneMapped: false })
    );
    wristPanel.position.set(0, 0.055, 0.12);
    wristPanel.rotation.x = -0.9;

    function wrapText(c, text, x, y, maxW, lh) {
        const words = text.split(' ');
        let line = '';
        for (const w of words) {
            const test = line ? `${line} ${w}` : w;
            if (c.measureText(test).width > maxW && line) {
                c.fillText(line, x, y);
                line = w;
                y += lh;
            } else line = test;
        }
        c.fillText(line, x, y);
    }

    function drawWrist() {
        const c = wristCanvas.getContext('2d');
        c.clearRect(0, 0, 512, 256);
        c.fillStyle = 'rgba(0,43,73,0.92)';
        c.beginPath();
        c.roundRect(0, 0, 512, 256, 24);
        c.fill();
        c.fillStyle = '#FF6600';
        c.fillRect(0, 0, 12, 256);
        const step = steps[stepIndex];
        const alert = api.getAlert();
        c.fillStyle = '#ffffff';
        c.font = 'bold 34px sans-serif';
        c.fillText(step ? `STEP ${stepIndex + 1} / ${steps.length}` : 'CLEARED', 32, 52);
        c.font = '28px sans-serif';
        if (alert) {
            c.fillStyle = '#f87171';
            wrapText(c, alert, 32, 100, 460, 34);
        } else if (step) {
            c.fillStyle = '#FFB27a';
            const text = step.id === 'esd_grounding' && strapOn ? 'Stand on the ESD mat and touch the tester with your strapped hand.' : step.vr;
            wrapText(c, text, 32, 100, 460, 34);
        } else {
            c.fillStyle = '#34d399';
            wrapText(c, 'STATUS: CLEARED FOR FABRICATION. Proceed to the air shower.', 32, 100, 460, 34);
        }
        wristTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------
    // Controllers, grips and hands
    // ---------------------------------------------------------------
    const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const reticle = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6600 }));
    reticle.visible = false;
    scene.add(reticle);

    const hands = [0, 1].map((i) => {
        const controller = renderer.xr.getController(i);
        const grip = renderer.xr.getControllerGrip(i);
        rig.add(controller, grip);
        const laser = new THREE.Line(laserGeo, new THREE.LineBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.8 }));
        laser.scale.z = 3;
        controller.add(laser);

        const h = { index: i, controller, grip, laser, hand: null, handedness: i === 0 ? 'left' : 'right', held: null, inRange: null, turnReady: true };

        const onConnect = (e) => {
            controller.userData.inputSource = e.data;
            h.handedness = e.data.handedness || h.handedness;
            if (!h.hand) {
                h.hand = makeHand(h.handedness);
                grip.add(h.hand.group);
                applyState(stepIndex);
            }
            if (h.handedness === 'left' && !wristPanel.parent) grip.add(wristPanel);
        };
        controller.addEventListener('connected', onConnect);
        controller.addEventListener('disconnected', () => { controller.userData.inputSource = null; });

        controller.addEventListener('selectstart', () => onPress(h, 'select'));
        controller.addEventListener('selectend', () => onRelease(h, 'select'));
        controller.addEventListener('squeezestart', () => onPress(h, 'squeeze'));
        controller.addEventListener('squeezeend', () => onRelease(h, 'squeeze'));
        return h;
    });

    const other = (h) => hands[1 - h.index];
    const pulse = (h, a, d) => api.pulse(h?.controller, a, d);

    function aim(h) {
        tempMatrix.identity().extractRotation(h.controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(h.controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const hit = raycaster.intersectObjects(interactive, true)[0];
        return hit && (hit.object.userData.stepId || hit.object.userData.action) ? hit : null;
    }

    function stationInReach(h) {
        h.grip.getWorldPosition(tmp);
        return stationBoxes.find((s) => s.box.containsPoint(tmp))?.id || null;
    }

    function onPress(h, button) {
        if (h.held) return;
        let stepId = button === 'squeeze' ? stationInReach(h) : null;
        if (!stepId) {
            const hit = aim(h);
            if (hit?.object.userData.action) { api.action(hit.object.userData.action, h.controller); return; }
            stepId = hit?.object.userData.stepId || null;
        }
        if (!stepId) return;

        if (!api.checkOrder(stepId, h.controller)) return;

        // Strap already on: touching/pointing at the tester runs the continuity check
        if (stepId === 'esd_grounding' && strapOn) {
            if (api.onMat()) api.complete('esd_grounding', h.controller);
            else api.alert('Stand on the ESD grounding mat before testing.', h.controller);
            return;
        }

        const item = makeItem(stepId);
        item.position.set(0, 0, -0.05);
        h.grip.add(item);
        h.held = { stepId, item, button };
        pulse(h, 0.35, 40);
        api.playPickup();
        drawWrist();
    }

    const falling = [];
    function onRelease(h, button) {
        if (!h.held || h.held.button !== button) return;
        const { item } = h.held;
        h.held = null;
        scene.attach(item);
        falling.push({ item, vy: 0, age: 0 });
        api.alert('Garment dropped. It is contaminated. Take a fresh one.', h.controller);
    }

    function don(h) {
        const { stepId, item } = h.held;
        h.grip.remove(item);
        h.held = null;
        if (stepId === 'esd_grounding') {
            strapOn = true;
            strapHand = other(h).hand ? other(h) : h;
            applyState(stepIndex);
            pulse(h, 0.5, 80);
            api.playPickup();
            drawWrist();
            return;
        }
        api.complete(stepId, h.controller);
    }

    // Where each garment has to go, relative to the headset
    function zone(h, stepId) {
        camera.getWorldPosition(head);
        camera.getWorldDirection(fwd);
        fwd.y = 0;
        fwd.normalize();
        switch (stepId) {
            case 'shoe_covers': return { kind: 'floor', pos: tmp2.set(head.x, 0.01, head.z), r: 0.45 };
            case 'hair_cover': return { pos: tmp2.copy(head).addScaledVector(UP, 0.11), r: 0.16 };
            case 'face_mask': return { pos: tmp2.copy(head).addScaledVector(fwd, 0.1).addScaledVector(UP, -0.04), r: 0.13 };
            case 'gowning_suit': return { pos: tmp2.copy(head).addScaledVector(UP, -0.42).addScaledVector(fwd, 0.12), r: 0.24 };
            case 'nitrile_gloves':
            case 'esd_grounding': {
                const o = other(h);
                if (o.hand && o.grip.visible) return { pos: o.grip.getWorldPosition(tmp2), r: 0.13 };
                return { pos: tmp2.copy(head).addScaledVector(UP, -0.42).addScaledVector(fwd, 0.12), r: 0.24 };
            }
        }
        return null;
    }

    function inZone(h, z) {
        h.grip.getWorldPosition(tmp);
        if (z.kind === 'floor') return tmp.y < 0.45 && Math.hypot(tmp.x - z.pos.x, tmp.z - z.pos.z) < 0.8;
        return tmp.distanceTo(z.pos) < z.r;
    }

    // ---------------------------------------------------------------
    // Visual state from protocol progress
    // ---------------------------------------------------------------
    function applyState(idx) {
        stepIndex = idx;
        if (idx === 0) { strapOn = false; strapHand = null; }
        feet.visible = idx > 0;
        hands.forEach((h) => {
            if (!h.hand) return;
            h.hand.cuff.visible = idx > 2;
            h.hand.skin.color.setHex(idx > 4 ? NITRILE : SKIN);
            h.hand.skin.roughness = idx > 4 ? 0.45 : 0.6;
            h.hand.strap.visible = (strapOn && strapHand === h) || (idx > 5 && strapHand === h);
        });
        drawWrist();
    }

    // ---------------------------------------------------------------
    // Locomotion: left stick moves, right stick snap-turns
    // ---------------------------------------------------------------
    function locomotion(dt) {
        hands.forEach((h) => {
            const gp = h.controller.userData.inputSource?.gamepad;
            if (!gp || gp.axes.length < 4) return;
            const ax = gp.axes[2];
            const ay = gp.axes[3];
            if (h.handedness === 'left') {
                if (Math.hypot(ax, ay) < 0.15) return;
                camera.getWorldDirection(fwd);
                fwd.y = 0;
                fwd.normalize();
                tmp.crossVectors(fwd, UP).normalize();
                rig.position.addScaledVector(fwd, -ay * 1.4 * dt).addScaledVector(tmp, ax * 1.4 * dt);
            } else {
                if (Math.abs(ax) < 0.3) { h.turnReady = true; return; }
                if (Math.abs(ax) > 0.7 && h.turnReady) {
                    h.turnReady = false;
                    const a = -Math.sign(ax) * Math.PI / 6;
                    camera.getWorldPosition(head);
                    rig.position.sub(head).applyAxisAngle(UP, a).add(head);
                    rig.rotation.y += a;
                }
            }
        });
        // Keep the head inside the room
        camera.getWorldPosition(head);
        const r = env.room;
        const cx = THREE.MathUtils.clamp(head.x, r.minX + 0.25, r.maxX - 0.25);
        const cz = THREE.MathUtils.clamp(head.z, r.minZ + 0.25, r.maxZ - 0.25);
        rig.position.x += cx - head.x;
        rig.position.z += cz - head.z;
    }

    // ---------------------------------------------------------------
    // Per-frame update
    // ---------------------------------------------------------------
    let wristTimer = 0;
    function update(dt, t) {
        const xr = renderer.xr.isPresenting;
        if (xr) locomotion(dt);

        // Booties follow your feet
        if (feet.visible) {
            camera.getWorldPosition(head);
            camera.getWorldDirection(fwd);
            feet.position.set(head.x, 0, head.z);
            feet.rotation.y = Math.atan2(fwd.x, fwd.z);
        }

        ghost.visible = false;
        ghostRing.visible = false;
        reticle.visible = false;

        hands.forEach((h) => {
            // Haptic tick when your hand enters a dispenser's reach
            const reach = h.held ? null : stationInReach(h);
            if (reach && reach !== h.inRange && xr) pulse(h, 0.15, 20);
            h.inRange = reach;

            if (h.held) {
                h.laser.visible = false;
                const z = zone(h, h.held.stepId);
                if (z) {
                    const g = z.kind === 'floor' ? ghostRing : ghost;
                    g.visible = true;
                    g.position.copy(z.pos);
                    if (g === ghost) g.scale.setScalar(z.r);
                    ghostMat.opacity = 0.18 + 0.1 * Math.sin(t * 6);
                    if (inZone(h, z)) don(h);
                }
            } else if (xr) {
                h.laser.visible = true;
                const hit = aim(h);
                h.laser.scale.z = hit ? hit.distance : 3;
                if (hit) { reticle.visible = true; reticle.position.copy(hit.point); }
            }
        });

        // Continuity check: strapped hand touches the tester while standing on the mat
        if (strapOn && steps[stepIndex]?.id === 'esd_grounding' && api.onMat()) {
            for (const h of hands) {
                if (!h.hand) continue;
                h.grip.getWorldPosition(tmp);
                if (tmp.distanceTo(testerPos) < 0.25) { api.complete('esd_grounding', h.controller); break; }
            }
        }

        // Dropped garments fall and fade
        for (let i = falling.length - 1; i >= 0; i--) {
            const f = falling[i];
            f.age += dt;
            if (f.item.position.y > 0.02) {
                f.vy -= 9.8 * dt;
                f.item.position.y = Math.max(0.02, f.item.position.y + f.vy * dt);
            }
            if (f.age > 4) {
                scene.remove(f.item);
                falling.splice(i, 1);
            }
        }

        // Refresh the wrist display a few times a second (alerts expire)
        wristTimer += dt;
        if (wristTimer > 0.25) { wristTimer = 0; if (xr) drawWrist(); }
    }

    // Spawn the player where the desktop camera was standing
    renderer.xr.addEventListener('sessionstart', () => {
        const desk = camera.position.clone();
        camera.getWorldDirection(fwd);
        rig.position.set(desk.x, 0, desk.z);
        rig.rotation.y = Math.atan2(-fwd.x, -fwd.z);
        rig.userData.desktopPose = { pos: desk, quat: camera.quaternion.clone() };
    });
    renderer.xr.addEventListener('sessionend', () => {
        const p = rig.userData.desktopPose;
        rig.position.set(0, 0, 0);
        rig.rotation.set(0, 0, 0);
        if (p) { camera.position.copy(p.pos); camera.quaternion.copy(p.quat); }
        hands.forEach((h) => { if (h.held) { h.grip.remove(h.held.item); h.held = null; } });
    });

    applyState(0);

    return {
        rig,
        hands,
        update,
        applyState,
        get strapOn() { return strapOn; },
        // Test hooks (used from the browser console; no headset needed)
        test: { makeItem, zone, inZone, onPress, onRelease, don, stationBoxes }
    };
}
