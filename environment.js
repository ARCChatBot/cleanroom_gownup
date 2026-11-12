// Photoreal pre-cleanroom (gowning room) built entirely from procedural geometry
// and canvas textures, so it stays zero-download and runs on standalone headsets.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

// Room interior: x -3..3, z -2..2, floor 0, ceiling 2.9 (metres)
const ROOM = { minX: -3, maxX: 3, minZ: -2, maxZ: 2, h: 2.9 };

// ---------------------------------------------------------
// Procedural textures
// ---------------------------------------------------------
function canvasTexture(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

const rand = (a, b) => a + Math.random() * (b - a);

function speckle(ctx, w, h, count, colors, rMin, rMax) {
    for (let i = 0; i < count; i++) {
        ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, rand(rMin, rMax), 0, Math.PI * 2);
        ctx.fill();
    }
}

function noiseFill(ctx, w, h, base, spread) {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = base + (Math.random() - 0.5) * spread;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
}

const tex = {
    floorColor: (r) => canvasTexture(1024, 1024, (c, w, h) => {
        c.fillStyle = '#b4babf';
        c.fillRect(0, 0, w, h);
        speckle(c, w, h, 22000, ['#8f969c', '#c8cdd1', '#dde1e4', '#7d848a', '#f4f6f7', '#a3a9ae'], 0.6, 2.2);
    }, { repeat: r }),
    floorRough: (r) => canvasTexture(256, 256, (c, w, h) => noiseFill(c, w, h, 120, 60), { repeat: r, srgb: false }),
    wallPanel: (r) => canvasTexture(256, 512, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#eceff2');
        g.addColorStop(0.5, '#f6f8f9');
        g.addColorStop(1, '#eceff2');
        c.fillStyle = g;
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#c3c9cf';
        c.fillRect(0, 0, 3, h);           // vertical seam
        c.fillStyle = '#ffffff';
        c.fillRect(3, 0, 2, h);
    }, { repeat: r }),
    brushed: (r = [1, 1]) => canvasTexture(512, 512, (c, w, h) => {
        c.fillStyle = '#b8bec4';
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 2600; i++) {
            c.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(40,45,50,0.08)';
            c.fillRect(Math.random() * w, Math.random() * h, rand(60, 400), 1);
        }
    }, { repeat: r }),
    ceilingTile: (r) => canvasTexture(256, 256, (c, w, h) => {
        c.fillStyle = '#f3f4f5';
        c.fillRect(0, 0, w, h);
        speckle(c, w, h, 900, ['#dcdfe2', '#e6e8ea'], 0.6, 1.2);
        c.strokeStyle = '#d4d8dc';
        c.lineWidth = 8;
        c.strokeRect(0, 0, w, h);
    }, { repeat: r }),
    perforated: () => canvasTexture(256, 256, (c, w, h) => {
        c.fillStyle = '#e9ecee';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#9aa1a8';
        for (let y = 6; y < h; y += 10) for (let x = 6 + ((y / 10) % 2) * 5; x < w; x += 10) {
            c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
        }
    }),
    locker: () => canvasTexture(128, 512, (c, w, h) => {
        c.fillStyle = '#8b96a1';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#5f6973';
        for (let i = 0; i < 6; i++) { c.fillRect(30, 30 + i * 12, 68, 5); c.fillRect(30, 400 + i * 12, 68, 5); }
        c.fillStyle = '#6f7a85';
        c.fillRect(0, 0, 3, h); c.fillRect(w - 3, 0, 3, h);
    }),
    mat: (color) => canvasTexture(256, 256, (c, w, h) => {
        c.fillStyle = color;
        c.fillRect(0, 0, w, h);
        speckle(c, w, h, 3000, ['rgba(255,255,255,0.05)', 'rgba(0,0,0,0.08)'], 0.5, 1.5);
    })
};

// ---------------------------------------------------------
// Shared materials
// ---------------------------------------------------------
const M = {
    steel: new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.brushed(), metalness: 1, roughness: 0.32 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x55606a, metalness: 0.8, roughness: 0.4 }),
    fabric: new THREE.MeshPhysicalMaterial({ color: 0xf6f8fa, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.7 }),
    fabricBlue: new THREE.MeshPhysicalMaterial({ color: 0x4f8fd8, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0xbcd7ff) }),
    plastic: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.4 }),
    slot: new THREE.MeshStandardMaterial({ color: 0x0e1114, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.14, envMapIntensity: 1.5, depthWrite: false }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.01 }),
    vsuBlue: new THREE.MeshStandardMaterial({ color: 0x002B49, roughness: 0.5 }),
    vsuOrange: new THREE.MeshStandardMaterial({ color: 0xFF6600, roughness: 0.45 })
};

// ---------------------------------------------------------
// Small builders
// ---------------------------------------------------------
function box(w, h, d, mat, x = 0, y = 0, z = 0, parent) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    if (parent) parent.add(m);
    return m;
}

function cyl(r, len, mat, parent, segs = 20) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, segs), mat);
    if (parent) parent.add(m);
    return m;
}

function textPlate(lines, w, h, { bg = '#002B49', fg = '#ffffff', stripe = '#FF6600', font = 'bold 54px' } = {}) {
    const pxW = 1024;
    const pxH = Math.round((pxW * h) / w);
    const t = canvasTexture(pxW, pxH, (c, W, H) => {
        c.fillStyle = bg;
        c.fillRect(0, 0, W, H);
        if (stripe) { c.fillStyle = stripe; c.fillRect(0, 0, 18, H); }
        c.fillStyle = fg;
        c.textBaseline = 'middle';
        const lh = H / (lines.length + 1);
        lines.forEach((ln, i) => {
            c.font = i === 0 ? `${font} system-ui, sans-serif` : `36px system-ui, sans-serif`;
            c.fillText(ln, 48, lh * (i + 1));
        });
    });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 }));
}

// Station plate with a status LED (orange = pending, green = verified)
function stationPlate(text) {
    const g = new THREE.Group();
    const plate = textPlate([text], 0.36, 0.075, { font: 'bold 60px' });
    g.add(plate);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff6600, emissiveIntensity: 2 }));
    led.position.set(0.2, 0, 0.005);
    g.add(led);
    return { group: g, led };
}

// Wall dispenser: stainless box with a dark front slot and product peeking out
function wallDispenser(w, h, d, productMat, productShape) {
    const g = new THREE.Group();
    box(w, h, d, M.steel, 0, 0, d / 2, g);
    box(w * 0.8, h * 0.18, 0.004, M.slot, 0, -h * 0.28, d + 0.002, g);
    box(w * 0.6, h * 0.08, 0.004, M.darkSteel, 0, h * 0.3, d + 0.002, g); // window/label strip
    for (let i = 0; i < 3; i++) {
        const p = productShape();
        p.material = productMat;
        p.position.set((i - 1) * w * 0.22, -h * 0.3, d + 0.01);
        p.rotation.z = rand(-0.3, 0.3);
        g.add(p);
    }
    return g;
}

// A person in a full cleanroom "bunny suit"
function bunnySuit({ pose = 0, fabric = M.fabric } = {}) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.5, 6, 16), fabric);
    torso.position.y = 1.22;
    torso.scale.z = 0.75;
    g.add(torso);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), fabric);
    hood.position.y = 1.68;
    hood.scale.set(1, 1.15, 1.05);
    g.add(hood);
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.05), M.blackPlastic);
    goggles.position.set(0, 1.71, 0.115);
    g.add(goggles);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), M.plastic);
    mask.position.set(0, 1.62, 0.1);
    mask.scale.set(1.1, 0.7, 0.6);
    g.add(mask);
    for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.7, 4, 12), fabric);
        leg.position.set(0.1 * s, 0.45, 0);
        g.add(leg);
        const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.12, 4, 10), M.fabricBlue);
        boot.rotation.x = Math.PI / 2;
        boot.position.set(0.1 * s, 0.07, 0.04);
        g.add(boot);
        const arm = new THREE.Group();
        arm.position.set(0.25 * s, 1.45, 0);
        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), fabric);
        sleeve.position.y = -0.3;
        arm.add(sleeve);
        const glove = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.fabricBlue);
        glove.position.y = -0.6;
        arm.add(glove);
        arm.rotation.x = -0.5 - pose * 0.3;
        arm.rotation.z = 0.12 * s;
        g.add(arm);
        g.userData[s < 0 ? 'armL' : 'armR'] = arm;
    }
    return g;
}

// Empty coverall hanging on a hanger
function hangingCoverall() {
    const g = new THREE.Group();
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 16, Math.PI * 1.4), M.steel);
    hook.position.y = 0.0;
    g.add(hook);
    const bar = box(0.42, 0.012, 0.012, M.plastic, 0, -0.06, 0, g);
    bar.rotation.z = 0;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.55, 6, 16), M.fabric);
    body.position.y = -0.48;
    body.scale.z = 0.35;
    g.add(body);
    const hoodM = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), M.fabric);
    hoodM.position.set(0, -0.09, -0.02);
    hoodM.scale.set(1, 0.8, 0.45);
    g.add(hoodM);
    box(0.012, 0.6, 0.002, M.darkSteel, 0, -0.45, 0.062, g); // zipper
    box(0.07, 0.04, 0.003, M.vsuBlue, -0.08, -0.3, 0.063, g); // chest patch
    for (const s of [-1, 1]) {
        const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 4, 10), M.fabric);
        sleeve.position.set(0.2 * s, -0.42, 0);
        sleeve.rotation.z = 0.12 * s;
        sleeve.scale.z = 0.6;
        g.add(sleeve);
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.62, 4, 10), M.fabric);
        leg.position.set(0.085 * s, -1.12, 0);
        leg.scale.z = 0.5;
        g.add(leg);
    }
    return g;
}

// ---------------------------------------------------------
// Main builder
// ---------------------------------------------------------
export function buildEnvironment(scene, renderer) {
    RectAreaLightUniformsLib.init();
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Temporary studio environment until the room captures itself (see end)
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.background = new THREE.Color(0xdfe4e8);

    const room = new THREE.Group();
    scene.add(room);
    const W = ROOM.maxX - ROOM.minX;
    const D = ROOM.maxZ - ROOM.minZ;

    // --- Floor: speckled epoxy with a glossy clear coat
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(W, D),
        new THREE.MeshPhysicalMaterial({
            map: tex.floorColor([3, 2]), roughnessMap: tex.floorRough([6, 4]),
            roughness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.12
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.userData.noCast = true;
    room.add(floor);

    // --- Walls: white FRP panels with seams every 1.2 m
    const wallMat = (len) => new THREE.MeshStandardMaterial({ map: tex.wallPanel([len / 1.2, 1]), roughness: 0.55 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, ROOM.h), wallMat(W));
    back.position.set(0, ROOM.h / 2, ROOM.minZ);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, ROOM.h), wallMat(W));
    front.position.set(0, ROOM.h / 2, ROOM.maxZ);
    front.rotation.y = Math.PI;
    const left = new THREE.Mesh(new THREE.PlaneGeometry(D, ROOM.h), wallMat(D));
    left.position.set(ROOM.minX, ROOM.h / 2, 0);
    left.rotation.y = Math.PI / 2;
    [back, front, left].forEach((w) => { w.userData.noCast = true; room.add(w); });

    // Right wall is built in segments around the viewing window (z 0.5..1.8, y 0.9..2.1)
    const rx = ROOM.maxX + 0.05;
    const seg = (z0, z1, y0, y1) => {
        const len = z1 - z0;
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, y1 - y0, len), wallMat(len));
        m.position.set(rx, (y0 + y1) / 2, (z0 + z1) / 2);
        m.userData.noCast = true;
        room.add(m);
    };
    seg(ROOM.minZ, 0.5, 0, ROOM.h);
    seg(1.8, ROOM.maxZ, 0, ROOM.h);
    seg(0.5, 1.8, 0, 0.9);
    seg(0.5, 1.8, 2.1, ROOM.h);

    // Window frame + glass
    const frame = new THREE.Group();
    frame.position.set(ROOM.maxX - 0.01, 1.5, 1.15);
    box(0.06, 0.05, 1.36, M.steel, 0, -0.62, 0, frame);
    box(0.06, 0.05, 1.36, M.steel, 0, 0.62, 0, frame);
    box(0.06, 1.29, 0.05, M.steel, 0, 0, -0.67, frame);
    box(0.06, 1.29, 0.05, M.steel, 0, 0, 0.67, frame);
    box(0.18, 0.03, 1.36, M.steel, -0.08, -0.6, 0, frame); // sill
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.2), M.glass);
    glass.rotation.y = -Math.PI / 2;
    glass.userData.noCast = true;
    frame.add(glass);
    room.add(frame);

    // Stainless kick plates
    const kick = (len, x, z, ry) => {
        const k = box(len, 0.15, 0.012, M.steel, x, 0.075, z, room);
        k.rotation.y = ry;
    };
    kick(W, 0, ROOM.minZ + 0.006, 0);
    kick(W, 0, ROOM.maxZ - 0.006, 0);
    kick(D, ROOM.minX + 0.006, 0, Math.PI / 2);
    kick(2.5, ROOM.maxX - 0.006, -0.75, Math.PI / 2);

    // --- Ceiling: 600 mm grid, HEPA diffusers, LED troffers
    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(W, D),
        new THREE.MeshStandardMaterial({ map: tex.ceilingTile([W / 0.6, D / 0.6]), roughness: 0.8 })
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = ROOM.h;
    ceiling.userData.noCast = true;
    room.add(ceiling);

    const troffers = [[-1.5, -0.9], [1.5, -0.9], [-1.5, 1.0], [1.5, 1.0]];
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf4f8ff, emissiveIntensity: 2.2 });
    troffers.forEach(([x, z]) => {
        box(1.24, 0.03, 0.64, M.plastic, x, ROOM.h - 0.012, z, room).userData.noCast = true;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.58), panelMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, ROOM.h - 0.03, z);
        p.userData.noCast = true;
        room.add(p);
        const ra = new THREE.RectAreaLight(0xf4f8ff, 9, 1.18, 0.58);
        ra.position.set(x, ROOM.h - 0.035, z);
        ra.lookAt(x, 0, z);
        room.add(ra);
    });
    [[0, -0.9], [0, 1.0]].forEach(([x, z]) => {
        const hepa = box(0.6, 0.04, 0.6, new THREE.MeshStandardMaterial({ map: tex.perforated(), roughness: 0.5, metalness: 0.2 }), x, ROOM.h - 0.02, z, room);
        hepa.userData.noCast = true;
    });

    // Key light that casts the soft contact shadows
    const key = new THREE.SpotLight(0xffffff, 26, 0, Math.PI / 2.4, 1, 2);
    key.position.set(0.3, ROOM.h - 0.05, -0.2);
    key.target.position.set(0.3, 0, -0.9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 6;
    key.shadow.camera.near = 0.3;
    key.shadow.camera.far = 6;
    room.add(key, key.target);
    room.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 0.25));

    // --- Signage
    const roomSign = textPlate(['GOWNING ROOM  ·  ISO CLASS 7', 'VSU Microelectronics Cleanroom Facility'], 1.1, 0.28);
    roomSign.position.set(-1.85, 2.4, ROOM.minZ + 0.005);
    room.add(roomSign);
    const poster = textPlate(
        ['GOWNING SEQUENCE', '1  Shoe covers', '2  Bouffant / beard cover', '3  Coverall', '4  Mask & glasses', '5  Nitrile gloves', '6  ESD strap + test'],
        0.5, 0.7, { bg: '#ffffff', fg: '#002B49', font: 'bold 64px' }
    );
    poster.position.set(ROOM.minX + 0.005, 1.5, -0.15);
    poster.rotation.y = Math.PI / 2;
    room.add(poster);

    // --- Crossover bench (dirty / clean side divider)
    const bench = new THREE.Group();
    bench.position.set(-1.05, 0, -0.65);
    box(2.9, 0.04, 0.36, M.steel, 0, 0.46, 0, bench);
    [-1.35, 0, 1.35].forEach((x) => {
        box(0.04, 0.44, 0.04, M.steel, x, 0.22, -0.13, bench);
        box(0.04, 0.44, 0.04, M.steel, x, 0.22, 0.13, bench);
        box(0.04, 0.03, 0.3, M.steel, x, 0.08, 0, bench);
    });
    room.add(bench);
    // Yellow/black floor tape along the bench line
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2.9), new THREE.MeshStandardMaterial({
        map: canvasTexture(64, 512, (c, w, h) => {
            c.fillStyle = '#f5c400'; c.fillRect(0, 0, w, h);
            c.fillStyle = '#111';
            for (let y = -64; y < h; y += 48) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 32); c.lineTo(w, y + 56); c.lineTo(0, y + 24); c.fill(); }
        }, { repeat: [1, 4] }), roughness: 0.5
    }));
    tape.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
    tape.position.set(-1.05, 0.002, -0.4);
    tape.userData.noCast = true;
    room.add(tape);

    // --- Tacky mat at the entry door, entry door on front wall
    const tacky = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshStandardMaterial({ map: tex.mat('#5b7fa6'), roughness: 0.3 }));
    tacky.rotation.x = -Math.PI / 2;
    tacky.position.set(-1.6, 0.003, 1.6);
    tacky.userData.noCast = true;
    room.add(tacky);
    const door = new THREE.Group();
    door.position.set(-1.6, 0, ROOM.maxZ - 0.01);
    door.rotation.y = Math.PI;
    box(1.0, 2.1, 0.04, M.plastic, 0, 1.05, 0, door);
    box(0.3, 0.02, 0.06, M.steel, 0.3, 1.0, 0.04, door);
    box(1.06, 0.05, 0.05, M.steel, 0, 2.12, 0, door);
    room.add(door);

    // --- Lockers on the left wall
    const lockerMat = new THREE.MeshStandardMaterial({ map: tex.locker(), metalness: 0.5, roughness: 0.45 });
    for (let i = 0; i < 4; i++) {
        const l = new THREE.Group();
        l.position.set(ROOM.minX + 0.22, 0, 0.45 + i * 0.37);
        box(0.44, 1.85, 0.36, lockerMat, 0, 1.0, 0, l);
        box(0.02, 0.12, 0.03, M.darkSteel, 0.23, 1.05, 0.12, l);
        box(0.44, 0.08, 0.36, M.darkSteel, 0, 0.04, 0, l);
        room.add(l);
    }

    // --- Mirror (gowning check) on the left wall
    const mirror = new THREE.Group();
    mirror.position.set(ROOM.minX + 0.01, 1.4, -1.15);
    mirror.rotation.y = Math.PI / 2;
    box(0.66, 1.26, 0.02, M.steel, 0, 0, 0, mirror);
    const glassMirror = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.2), M.mirror);
    glassMirror.position.z = 0.012;
    mirror.add(glassMirror);
    room.add(mirror);

    // --- Air shower door (decor) on right wall
    const shower = new THREE.Group();
    shower.position.set(ROOM.maxX - 0.01, 0, -0.45);
    shower.rotation.y = -Math.PI / 2;
    box(1.1, 2.25, 0.08, M.steel, 0, 1.125, 0, shower);
    box(0.92, 2.05, 0.02, M.plastic, 0, 1.06, 0.05, shower);
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.5), new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.3 }));
    sw.position.set(0, 1.5, 0.062);
    shower.add(sw);
    box(0.04, 0.4, 0.05, M.steel, 0.36, 1.05, 0.08, shower);
    const ready = new THREE.Mesh(new THREE.CircleGeometry(0.02, 16), new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 3 }));
    ready.position.set(0.42, 1.55, 0.062);
    shower.add(ready);
    const showerSign = textPlate(['AIR SHOWER  →  CLEANROOM'], 0.7, 0.1, { font: 'bold 64px' });
    showerSign.position.set(0, 2.38, 0.01);
    shower.add(showerSign);
    room.add(shower);

    // ---------------------------------------------------------
    // GOWNING STATIONS (each prop is the interactive target)
    // ---------------------------------------------------------
    const stations = [];
    const addStation = (id, group, plateText, platePos, plateRotY, anchor) => {
        group.traverse((o) => { o.userData.stepId = id; });
        room.add(group);
        const { group: plate, led } = stationPlate(plateText);
        plate.position.copy(platePos);
        plate.rotation.y = plateRotY;
        room.add(plate);
        plate.traverse((o) => { o.userData.stepId = id; });
        stations.push({ id, group, plate, led, anchor });
    };
    const zw = ROOM.minZ;

    // 1. Shoe cover / bootie dispenser
    const booties = wallDispenser(0.42, 0.34, 0.2, M.fabricBlue, () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8));
        m.scale.set(1.3, 0.6, 0.6);
        return m;
    });
    booties.position.set(-2.3, 1.05, zw);
    addStation('shoe_covers', booties, '1  SHOE COVERS', new THREE.Vector3(-2.3, 0.8, zw + 0.005), 0, new THREE.Vector3(-2.3, 1.45, zw + 0.15));

    // 2. Bouffant / beard cover dispenser
    const bouffant = wallDispenser(0.42, 0.34, 0.2, M.fabric, () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8));
        m.scale.set(1.2, 0.7, 0.7);
        return m;
    });
    bouffant.position.set(-1.45, 1.4, zw);
    addStation('hair_cover', bouffant, '2  BOUFFANT / BEARD', new THREE.Vector3(-1.45, 1.15, zw + 0.005), 0, new THREE.Vector3(-1.45, 1.8, zw + 0.15));

    // 3. Coverall rack
    const rack = new THREE.Group();
    rack.position.set(0, 0, zw);
    const rod = cyl(0.012, 1.5, M.steel, rack);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 1.95, 0.25);
    for (const x of [-0.75, 0.75]) {
        box(0.03, 0.03, 0.27, M.steel, x, 1.95, 0.135, rack);
    }
    [-0.5, -0.17, 0.17, 0.5].forEach((x, i) => {
        const c = hangingCoverall();
        c.position.set(x, 1.955, 0.25);
        c.rotation.y = rand(-0.12, 0.12);
        rack.add(c);
        if (i === 3) c.rotation.y = 0.35;
    });
    // Shelf of sealed garment packs
    box(1.5, 0.025, 0.3, M.steel, 0, 2.22, 0.15, rack);
    for (let i = 0; i < 7; i++) {
        const pk = box(0.18, 0.06, 0.24, M.plastic, -0.6 + i * 0.2, 2.265, 0.15, rack);
        box(0.181, 0.015, 0.241, M.vsuBlue, 0, 0, 0, pk);
    }
    addStation('gowning_suit', rack, '3  COVERALL', new THREE.Vector3(0.95, 1.45, zw + 0.005), 0, new THREE.Vector3(0, 1.0, zw + 0.3));

    // 4. Face mask dispenser + safety glasses shelf
    const maskSt = new THREE.Group();
    const maskBox = wallDispenser(0.38, 0.3, 0.18, M.plastic, () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8));
        m.scale.set(1.3, 0.8, 0.4);
        return m;
    });
    maskBox.position.set(0, 0.25, 0);
    maskSt.add(maskBox);
    box(0.42, 0.015, 0.16, M.steel, 0, -0.05, 0.08, maskSt);
    for (let i = 0; i < 3; i++) {
        const gl = new THREE.Group();
        gl.position.set(-0.13 + i * 0.13, -0.02, 0.09);
        box(0.12, 0.04, 0.004, M.glass, 0, 0, 0, gl);
        box(0.125, 0.008, 0.01, M.blackPlastic, 0, 0.022, 0, gl);
        box(0.005, 0.01, 0.11, M.blackPlastic, -0.06, 0.02, -0.055, gl);
        box(0.005, 0.01, 0.11, M.blackPlastic, 0.06, 0.02, -0.055, gl);
        maskSt.add(gl);
    }
    maskSt.position.set(1.35, 1.15, zw);
    addStation('face_mask', maskSt, '4  MASK & GLASSES', new THREE.Vector3(1.35, 0.95, zw + 0.005), 0, new THREE.Vector3(1.35, 1.7, zw + 0.15));

    // 5. Triple glove box holder
    const gloves = new THREE.Group();
    box(0.3, 0.46, 0.012, M.steel, 0, 0, 0.006, gloves);
    for (let i = 0; i < 3; i++) {
        const y = -0.15 + i * 0.15;
        box(0.26, 0.12, 0.1, M.plastic, 0, y, 0.062, gloves);
        box(0.261, 0.03, 0.101, new THREE.MeshStandardMaterial({ color: [0x7c3aed, 0x2563eb, 0x0ea5e9][i], roughness: 0.5 }), 0, y + 0.045, 0.062, gloves);
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshPhysicalMaterial({ color: 0xdbeafe, roughness: 0.4, transmission: 0, sheen: 0.5 }));
        tuft.scale.set(1.4, 0.7, 0.6);
        tuft.position.set(0, y, 0.115);
        gloves.add(tuft);
    }
    gloves.position.set(2.15, 1.3, zw);
    addStation('nitrile_gloves', gloves, '5  NITRILE GLOVES', new THREE.Vector3(2.15, 0.98, zw + 0.005), 0, new THREE.Vector3(2.15, 1.65, zw + 0.15));

    // 6. ESD wrist strap / footwear tester on the right wall + grounding mat
    const esdPos = new THREE.Vector3(2.45, 0, -1.45);
    const tester = new THREE.Group();
    box(0.28, 0.38, 0.07, new THREE.MeshStandardMaterial({ color: 0x3a434c, roughness: 0.5 }), 0, 0, 0.035, tester);
    const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.07), new THREE.MeshStandardMaterial({ color: 0x0a2a14, emissive: 0x22c55e, emissiveIntensity: 0.6 }));
    lcd.position.set(0, 0.1, 0.072);
    tester.add(lcd);
    ['PASS', 'LOW', 'HIGH'].forEach((_, i) => {
        const l = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshStandardMaterial({ color: [0x22c55e, 0xf59e0b, 0xef4444][i], emissive: [0x22c55e, 0xf59e0b, 0xef4444][i], emissiveIntensity: 0.4 }));
        l.position.set(-0.06 + i * 0.06, 0.0, 0.072);
        tester.add(l);
    });
    const jack = cyl(0.012, 0.02, M.steel, tester);
    jack.rotation.x = Math.PI / 2;
    jack.position.set(0, -0.1, 0.075);
    const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.03, 0.004, 64, 6, 2, 9), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 }));
    coil.position.set(0, -0.2, 0.08);
    coil.scale.set(0.8, 2.2, 0.8);
    tester.add(coil);
    tester.position.set(ROOM.maxX, 1.15, esdPos.z);
    tester.rotation.y = -Math.PI / 2;
    addStation('esd_grounding', tester, '6  ESD TEST', new THREE.Vector3(ROOM.maxX - 0.005, 0.72, esdPos.z), -Math.PI / 2, new THREE.Vector3(ROOM.maxX - 0.15, 1.55, esdPos.z));

    const esdMatMaterial = new THREE.MeshStandardMaterial({ map: tex.mat('#3d5a6c'), roughness: 0.7, emissive: 0x000000 });
    const esdMat = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), esdMatMaterial);
    esdMat.rotation.x = -Math.PI / 2;
    esdMat.position.set(esdPos.x, 0.004, esdPos.z);
    esdMat.userData.noCast = true;
    room.add(esdMat);
    const footPlate = box(0.42, 0.012, 0.32, M.steel, esdPos.x + 0.15, 0.01, esdPos.z, room);
    footPlate.userData.noCast = true;

    // ---------------------------------------------------------
    // LITHOGRAPHY BAY seen through the window (amber light)
    // ---------------------------------------------------------
    const bay = new THREE.Group();
    const bayWhite = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.6, emissive: 0x7a4a00, emissiveIntensity: 0.55 });
    const bayFabric = new THREE.MeshPhysicalMaterial({ color: 0xe8d9a8, roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffd27a), emissive: 0x6b4000, emissiveIntensity: 0.45 });
    const bf = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), new THREE.MeshPhysicalMaterial({ color: 0xb8a77c, roughness: 0.3, clearcoat: 0.5, emissive: 0x5a3600, emissiveIntensity: 0.5 }));
    bf.rotation.x = -Math.PI / 2;
    bf.position.set(5.6, 0, 0.8);
    bay.add(bf);
    const bc = new THREE.Mesh(new THREE.PlaneGeometry(5, 6), bayWhite);
    bc.rotation.x = Math.PI / 2;
    bc.position.set(5.6, ROOM.h, 0.8);
    bay.add(bc);
    const bw = new THREE.Mesh(new THREE.PlaneGeometry(6, ROOM.h), bayWhite);
    bw.rotation.y = -Math.PI / 2;
    bw.position.set(8.1, ROOM.h / 2, 0.8);
    bay.add(bw);
    for (const z of [-2.2, 3.8]) {
        const sw2 = new THREE.Mesh(new THREE.PlaneGeometry(5, ROOM.h), bayWhite);
        sw2.position.set(5.6, ROOM.h / 2, z);
        sw2.rotation.y = z < 0 ? 0 : Math.PI;
        bay.add(sw2);
    }
    const amberPanel = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffb347, emissiveIntensity: 2.5 });
    [[4.8, 0.2], [4.8, 2.0], [6.8, 0.2], [6.8, 2.0]].forEach(([x, z]) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), amberPanel);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, ROOM.h - 0.01, z);
        bay.add(p);
    });
    [[5.0, 0.4], [6.5, 2.2]].forEach(([x, z]) => {
        const pl = new THREE.PointLight(0xffa030, 45, 4.2, 1.4);
        pl.position.set(x, 2.5, z);
        bay.add(pl);
    });
    // Tools: lithography stepper + wet bench
    const stepper = new THREE.Group();
    box(1.4, 1.9, 1.1, bayWhite, 0, 0.95, 0, stepper);
    box(0.6, 0.3, 0.02, M.blackPlastic, -0.2, 1.4, 0.56, stepper);
    box(1.42, 0.12, 1.12, M.vsuBlue, 0, 1.85, 0, stepper);
    stepper.position.set(6.9, 0, -0.6);
    bay.add(stepper);
    const wet = new THREE.Group();
    box(2.4, 0.9, 0.8, bayWhite, 0, 0.45, 0, wet);
    box(2.4, 0.04, 0.8, M.steel, 0, 0.92, 0, wet);
    box(2.4, 0.9, 0.05, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, roughness: 0.1 }), 0, 1.5, -0.38, wet);
    wet.position.set(5.6, 0, 2.9);
    bay.add(wet);
    const technicians = [];
    [[4.4, 1.6, -0.6, 0], [5.4, 2.3, Math.PI, 1], [6.1, -0.5, Math.PI / 2, 0.5]].forEach(([x, z, ry, pose]) => {
        const t = bunnySuit({ pose, fabric: bayFabric });
        t.position.set(x, 0, z);
        t.rotation.y = ry;
        t.userData.phase = rand(0, 6);
        bay.add(t);
        technicians.push(t);
    });
    room.add(bay);

    // Shadows on everything except big flat surfaces / emissive / glass
    room.traverse((o) => {
        if (o.isMesh) {
            o.receiveShadow = true;
            o.castShadow = !o.userData.noCast && o.material !== M.glass && !(o.material.emissive && o.material.emissive.getHex() !== 0);
        }
    });

    // Capture the finished room into a cube map and use it for all reflections:
    // the floor clear coat, steel and mirror now reflect the actual room.
    const cubeRT = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
    const cubeCam = new THREE.CubeCamera(0.05, 20, cubeRT);
    cubeCam.position.set(0, 1.5, 0);
    scene.add(cubeCam);
    cubeCam.update(renderer, scene);
    scene.environment = pmrem.fromCubemap(cubeRT.texture).texture;
    scene.remove(cubeCam);

    return { stations, esdPos, esdMatMaterial, technicians, room: ROOM };
}
