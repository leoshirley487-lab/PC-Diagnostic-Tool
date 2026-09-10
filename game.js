import * as THREE from "./vendor/three.module.min.js";

const OWNER_NAME = "Leo Shirley";
const OWNER_EMAIL = "leogshirley@outlook.com";
// SHA-256 of the personal key (lowercase). Key is documented in README.
const UNLOCK_HASH =
  "8c56c3b4e91eb04ef52abbfdd0f0f96825c31e984a768a18edcc208085de8103";
const UNLOCK_HASH_ALT =
  "a4df6bfb625e9e6847c0b470ce3c518f3881a8cd52a7f2328238692964969f4a";
const STORAGE_KEY = "leo-poly-track-unlock-v1";
const BEST_KEY = "leo-poly-track-best-v1";

const TOTAL_LAPS = 3;
const TRACK_WIDTH = 10;
const MAX_SPEED = 42;
const ACCEL = 34;
const BRAKE = 42;
const DRAG = 5;
const STEER_SPEED = 2.5;

const ui = {
  lockScreen: document.getElementById("lock-screen"),
  menuScreen: document.getElementById("menu-screen"),
  pauseScreen: document.getElementById("pause-screen"),
  finishScreen: document.getElementById("finish-screen"),
  unlockForm: document.getElementById("unlock-form"),
  unlockInput: document.getElementById("unlock-input"),
  unlockError: document.getElementById("unlock-error"),
  startBtn: document.getElementById("start-btn"),
  lockDeviceBtn: document.getElementById("lock-device-btn"),
  pauseBtn: document.getElementById("pause-btn"),
  resumeBtn: document.getElementById("resume-btn"),
  restartBtn: document.getElementById("restart-btn"),
  quitBtn: document.getElementById("quit-btn"),
  raceAgainBtn: document.getElementById("race-again-btn"),
  finishMenuBtn: document.getElementById("finish-menu-btn"),
  finishTitle: document.getElementById("finish-title"),
  finishTime: document.getElementById("finish-time"),
  hud: document.getElementById("hud"),
  touchControls: document.getElementById("touch-controls"),
  lapReadout: document.getElementById("lap-readout"),
  timeReadout: document.getElementById("time-readout"),
  bestReadout: document.getElementById("best-readout"),
  speedReadout: document.getElementById("speed-readout"),
  canvas: document.getElementById("game-canvas"),
};

const input = {
  steer: 0,
  accel: false,
  brake: false,
};

let unlocked = false;
let sceneReady = false;
let racing = false;
let paused = false;
let clock = new THREE.Clock(false);
let raceTime = 0;
let lap = 1;
let progress = 0;
let lastProgress = 0;
let speed = 0;
let bestMs = Number(localStorage.getItem(BEST_KEY) || 0);

let renderer, scene, camera, car, trackCurve, trackPoints;
let grassMesh, skyMesh;
let checkpointHits = new Set();
let animFrame = 0;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

async function isValidKey(raw) {
  const normalized = normalizeKey(raw);
  const hash = await sha256Hex(normalized);
  return hash === UNLOCK_HASH || hash === UNLOCK_HASH_ALT;
}

function deviceUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data?.ok === true && data?.owner === OWNER_EMAIL;
  } catch {
    return false;
  }
}

function persistUnlock() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ok: true,
      owner: OWNER_EMAIL,
      name: OWNER_NAME,
      at: Date.now(),
    })
  );
}

function clearUnlock() {
  localStorage.removeItem(STORAGE_KEY);
}

function formatTime(ms) {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function show(el) {
  el.hidden = false;
}

function hide(el) {
  el.hidden = true;
}

function setPlayingUI(active) {
  if (active) {
    show(ui.hud);
    show(ui.touchControls);
  } else {
    hide(ui.hud);
    hide(ui.touchControls);
  }
}

function updateBestReadout() {
  ui.bestReadout.textContent = bestMs ? formatTime(bestMs) : "—";
}

function buildTrackCurve() {
  const waypoints = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(40, 0, -20),
    new THREE.Vector3(70, 0, -55),
    new THREE.Vector3(55, 0, -100),
    new THREE.Vector3(10, 0, -120),
    new THREE.Vector3(-35, 0, -95),
    new THREE.Vector3(-60, 0, -50),
    new THREE.Vector3(-45, 0, -10),
    new THREE.Vector3(-20, 0, 15),
    new THREE.Vector3(0, 0, 0),
  ];
  return new THREE.CatmullRomCurve3(waypoints, true, "catmullrom", 0.45);
}

function createTrackMesh(curve) {
  const group = new THREE.Group();
  const segments = 280;
  const half = TRACK_WIDTH / 2;
  const positions = [];
  const colors = [];
  const indices = [];
  const colorAsphalt = new THREE.Color("#2f3540");
  const colorEdge = new THREE.Color("#ffffff");
  const colorLane = new THREE.Color("#d7dde8");
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();

    const left = point.clone().addScaledVector(side, half);
    const leftPaint = point.clone().addScaledVector(side, half * 0.88);
    const leftLane = point.clone().addScaledVector(side, 0.18);
    const rightLane = point.clone().addScaledVector(side, -0.18);
    const rightPaint = point.clone().addScaledVector(side, -half * 0.88);
    const right = point.clone().addScaledVector(side, -half);

    for (const [v, c] of [
      [left, colorEdge],
      [leftPaint, colorEdge],
      [leftLane, colorAsphalt],
      [rightLane, colorAsphalt],
      [rightPaint, colorEdge],
      [right, colorEdge],
    ]) {
      positions.push(v.x, 0.08, v.z);
      colors.push(c.r, c.g, c.b);
    }

    // dashed center suggestion every other segment
    if (i % 2 === 0) {
      const c0 = point.clone().addScaledVector(side, 0.18);
      const c1 = point.clone().addScaledVector(side, -0.18);
      // tint asphalt lane slightly lighter for a soft mid stripe
      const base = (positions.length / 3 - 4) * 3;
      colors[base] = colorLane.r;
      colors[base + 1] = colorLane.g;
      colors[base + 2] = colorLane.b;
      colors[base + 3] = colorLane.r;
      colors[base + 4] = colorLane.g;
      colors[base + 5] = colorLane.b;
      void c0;
      void c1;
    }
  }

  for (let i = 0; i < segments; i++) {
    const a = i * 6;
    const b = (i + 1) * 6;
    for (let k = 0; k < 5; k++) {
      // CCW winding so the top face is visible from above
      indices.push(a + k, a + k + 1, b + k);
      indices.push(a + k + 1, b + k + 1, b + k);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);

  // Raised curb rails for Poly Track silhouette
  const railMat = new THREE.MeshLambertMaterial({
    color: "#f2f5fa",
    flatShading: true,
  });
  const railGeo = new THREE.BoxGeometry(0.35, 0.55, 1);
  for (let i = 0; i < segments; i += 3) {
    const t = i / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3().crossVectors(up, tangent).normalize();
    for (const sign of [1, -1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.copy(point).addScaledVector(side, sign * (half + 0.15));
      rail.position.y = 0.28;
      rail.lookAt(point.clone().add(tangent));
      group.add(rail);
    }
  }

  return group;
}

function createCar() {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshLambertMaterial({
    color: "#ff6b3d",
    flatShading: true,
  });
  const darkMat = new THREE.MeshLambertMaterial({
    color: "#2b3038",
    flatShading: true,
  });
  const glassMat = new THREE.MeshLambertMaterial({
    color: "#9ad7ef",
    flatShading: true,
  });
  const wheelMat = new THREE.MeshLambertMaterial({
    color: "#1a1d22",
    flatShading: true,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.4), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.4, 1.1), glassMat);
  cabin.position.set(0, 0.78, -0.1);
  cabin.castShadow = true;
  group.add(cabin);

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.35), darkMat);
  spoiler.position.set(0, 0.72, -1.05);
  group.add(spoiler);

  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.28, 8);
  const wheelPositions = [
    [0.78, 0.28, 0.75],
    [-0.78, 0.28, 0.75],
    [0.78, 0.28, -0.75],
    [-0.78, 0.28, -0.75],
  ];
  for (const [x, y, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    group.add(wheel);
  }

  group.rotation.order = "YXZ";
  return group;
}

function createWorld() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#b7e0ef", 110, 220);

  camera = new THREE.PerspectiveCamera(
    55,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );

  try {
    renderer = new THREE.WebGLRenderer({
      canvas: ui.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.error(err);
    throw new Error(
      "WebGL is required for Leo Poly Track. Try Safari on your iPad."
    );
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor("#9ad7ef");
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const hemi = new THREE.HemisphereLight("#eaf7ff", "#6db36d", 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight("#fff4e0", 1.15);
  sun.position.set(40, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  scene.add(sun);

  trackCurve = buildTrackCurve();
  trackPoints = trackCurve.getSpacedPoints(400);
  scene.add(createTrackMesh(trackCurve));

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(160, 48),
    new THREE.MeshLambertMaterial({ color: "#6db36d", flatShading: true })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  grassMesh = ground;
  scene.add(ground);

  // Soft low hills around the track
  const hillMat = new THREE.MeshLambertMaterial({
    color: "#5fa45f",
    flatShading: true,
  });
  for (let i = 0; i < 18; i++) {
    const hill = new THREE.Mesh(
      new THREE.ConeGeometry(6 + Math.random() * 8, 3 + Math.random() * 5, 5),
      hillMat
    );
    const angle = (i / 18) * Math.PI * 2;
    const radius = 85 + Math.random() * 35;
    hill.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    hill.rotation.y = Math.random() * Math.PI;
    scene.add(hill);
  }

  // Start/finish stripe
  const finish = new THREE.Mesh(
    new THREE.BoxGeometry(TRACK_WIDTH, 0.06, 1.2),
    new THREE.MeshLambertMaterial({ color: "#f7f7f7", flatShading: true })
  );
  const startPoint = trackCurve.getPointAt(0);
  const startTangent = trackCurve.getTangentAt(0);
  finish.position.copy(startPoint);
  finish.position.y = 0.08;
  finish.lookAt(startPoint.clone().add(startTangent));
  scene.add(finish);

  car = createCar();
  scene.add(car);

  // Decorative sky dome tint
  skyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({
      color: "#9ad7ef",
      side: THREE.BackSide,
    })
  );
  scene.add(skyMesh);

  placeCarAt(0.02);
  sceneReady = true;
}

function placeCarAt(t) {
  const point = trackCurve.getPointAt(t % 1);
  const tangent = trackCurve.getTangentAt(t % 1).normalize();
  car.position.copy(point);
  car.position.y = 0.05;
  const yaw = Math.atan2(tangent.x, tangent.z);
  car.rotation.y = yaw;
  progress = t % 1;
  lastProgress = progress;
}

function nearestTrackProgress(position) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < trackPoints.length; i++) {
    const p = trackPoints[i];
    const dx = position.x - p.x;
    const dz = position.z - p.z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) {
      bestDist = d;
      best = i / trackPoints.length;
    }
  }
  return { t: best, dist: Math.sqrt(bestDist) };
}

function resetRace() {
  speed = 0;
  raceTime = 0;
  lap = 1;
  checkpointHits = new Set();
  placeCarAt(0.02);
  clock = new THREE.Clock(false);
  ui.lapReadout.textContent = `1/${TOTAL_LAPS}`;
  ui.timeReadout.textContent = formatTime(0);
  ui.speedReadout.textContent = "0";
  updateBestReadout();
}

function startRace() {
  if (!sceneReady || !car || !trackCurve) return;
  hide(ui.menuScreen);
  hide(ui.pauseScreen);
  hide(ui.finishScreen);
  resetRace();
  racing = true;
  paused = false;
  setPlayingUI(true);
  // Snap camera behind the car immediately
  const behind = new THREE.Vector3(0, 3.2, -7.2);
  behind.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
  camera.position.copy(car.position).add(behind);
  const look = car.position.clone();
  look.y += 1.1;
  camera.lookAt(look);
  clock.start();
}

function pauseRace() {
  if (!racing || paused) return;
  paused = true;
  clock.stop();
  show(ui.pauseScreen);
}

function resumeRace() {
  if (!racing || !paused) return;
  paused = false;
  hide(ui.pauseScreen);
  clock.start();
}

function quitToMenu() {
  racing = false;
  paused = false;
  hide(ui.pauseScreen);
  hide(ui.finishScreen);
  setPlayingUI(false);
  show(ui.menuScreen);
  placeCarAt(0.02);
  speed = 0;
}

function finishRace() {
  racing = false;
  paused = false;
  clock.stop();
  setPlayingUI(false);
  const finalMs = raceTime * 1000;
  if (!bestMs || finalMs < bestMs) {
    bestMs = finalMs;
    localStorage.setItem(BEST_KEY, String(bestMs));
    ui.finishTitle.textContent = "New personal best";
  } else {
    ui.finishTitle.textContent = "Race complete";
  }
  ui.finishTime.textContent = formatTime(finalMs);
  updateBestReadout();
  show(ui.finishScreen);
}

function bindTouchButton(el, on, off) {
  let held = false;
  const start = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (held) return;
    held = true;
    if (e.pointerId != null) {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    el.classList.add("is-active");
    on();
  };
  const end = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!held) return;
    held = false;
    if (e.pointerId != null) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
    el.classList.remove("is-active");
    off();
  };
  // Pointer events (modern iPad) + touch fallback for older Safari.
  el.addEventListener("pointerdown", start);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("lostpointercapture", end);
  el.addEventListener("touchstart", start, { passive: false });
  el.addEventListener("touchend", end, { passive: false });
  el.addEventListener("touchcancel", end, { passive: false });
}

function setupControls() {
  document.querySelectorAll(".steer-btn").forEach((btn) => {
    const dir = Number(btn.dataset.dir);
    bindTouchButton(
      btn,
      () => {
        input.steer = dir;
      },
      () => {
        if (input.steer === dir) input.steer = 0;
      }
    );
  });

  bindTouchButton(
    document.getElementById("accel-btn"),
    () => {
      input.accel = true;
    },
    () => {
      input.accel = false;
    }
  );

  bindTouchButton(
    document.getElementById("brake-btn"),
    () => {
      input.brake = true;
    },
    () => {
      input.brake = false;
    }
  );

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "ArrowLeft" || e.code === "KeyA") input.steer = -1;
    if (e.code === "ArrowRight" || e.code === "KeyD") input.steer = 1;
    if (e.code === "ArrowUp" || e.code === "KeyW") input.accel = true;
    if (e.code === "ArrowDown" || e.code === "KeyS" || e.code === "Space")
      input.brake = true;
    if (e.code === "Escape" && racing) {
      if (paused) resumeRace();
      else pauseRace();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "ArrowLeft" || e.code === "KeyA") {
      if (input.steer < 0) input.steer = 0;
    }
    if (e.code === "ArrowRight" || e.code === "KeyD") {
      if (input.steer > 0) input.steer = 0;
    }
    if (e.code === "ArrowUp" || e.code === "KeyW") input.accel = false;
    if (e.code === "ArrowDown" || e.code === "KeyS" || e.code === "Space")
      input.brake = false;
  });

  // Prevent iOS rubber-band / gesture scroll while racing
  document.body.addEventListener(
    "touchmove",
    (e) => {
      if (racing) e.preventDefault();
    },
    { passive: false }
  );
}

function updateCamera(dt) {
  const behind = new THREE.Vector3(0, 3.2, -7.2);
  behind.applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
  const desired = car.position.clone().add(behind);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const look = car.position.clone();
  look.y += 1.1;
  camera.lookAt(look);
}

function updateCar(dt) {
  if (input.accel) speed += ACCEL * dt;
  if (input.brake) speed -= BRAKE * dt;
  if (!input.accel && !input.brake) {
    speed *= Math.pow(0.2, dt);
  } else if (!input.accel && input.brake) {
    /* braking already applied */
  } else {
    speed -= Math.sign(speed) * DRAG * dt;
  }
  if (Math.abs(speed) < 0.05 && !input.accel) speed = 0;
  speed = THREE.MathUtils.clamp(speed, -10, MAX_SPEED);

  const steerFactor = THREE.MathUtils.clamp(Math.abs(speed) / 12, 0.2, 1);
  car.rotation.y += input.steer * STEER_SPEED * steerFactor * dt * Math.sign(speed || 1);

  const forward = new THREE.Vector3(
    Math.sin(car.rotation.y),
    0,
    Math.cos(car.rotation.y)
  );
  car.position.addScaledVector(forward, speed * dt);

  const { t, dist } = nearestTrackProgress(car.position);
  progress = t;

  // Soft walls: pull back toward track center when off asphalt
  if (dist > TRACK_WIDTH * 0.55) {
    const center = trackCurve.getPointAt(t);
    const pull = center.clone().sub(car.position);
    pull.y = 0;
    car.position.addScaledVector(pull.normalize(), (dist - TRACK_WIDTH * 0.5) * 2.5 * dt);
    speed *= 0.96;
  }

  car.position.y = 0.05;
  car.rotation.z = THREE.MathUtils.damp(car.rotation.z, -input.steer * 0.18, 8, dt);
  car.rotation.x = THREE.MathUtils.damp(car.rotation.x, -speed * 0.004, 8, dt);

  // Lap detection: crossing start after visiting mid checkpoints
  if (progress - lastProgress < -0.7) {
    // wrapped near start
    if (checkpointHits.has("mid") && checkpointHits.has("far")) {
      lap += 1;
      checkpointHits = new Set();
      if (lap > TOTAL_LAPS) {
        finishRace();
        return;
      }
      ui.lapReadout.textContent = `${lap}/${TOTAL_LAPS}`;
    }
  }
  if (progress > 0.33 && progress < 0.45) checkpointHits.add("mid");
  if (progress > 0.66 && progress < 0.8) checkpointHits.add("far");
  lastProgress = progress;

  ui.speedReadout.textContent = String(Math.max(0, Math.round(speed * 4.2)));
}

function animate() {
  animFrame = requestAnimationFrame(animate);
  if (!sceneReady) return;

  const dt = Math.min(clock.getDelta(), 0.05);

  if (racing && !paused) {
    raceTime += dt;
    ui.timeReadout.textContent = formatTime(raceTime * 1000);
    updateCar(dt);
  } else if (!racing) {
    // Idle slow spin of camera around start
    const idleT = performance.now() * 0.00015;
    const p = trackCurve.getPointAt(0.02);
    camera.position.set(
      p.x + Math.cos(idleT) * 14,
      6,
      p.z + Math.sin(idleT) * 14
    );
    camera.lookAt(p.x, 0.8, p.z);
  }

  if (racing) updateCamera(Math.max(dt, 0.016));

  if (skyMesh) {
    skyMesh.position.copy(camera.position);
  }

  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

async function enterUnlocked() {
  unlocked = true;
  hide(ui.lockScreen);
  updateBestReadout();
  if (!sceneReady) {
    try {
      createWorld();
      setupControls();
      window.addEventListener("resize", onResize);
      animate();
    } catch (err) {
      show(ui.lockScreen);
      ui.unlockError.hidden = false;
      ui.unlockError.textContent =
        "WebGL unavailable in this browser. Open in Safari on your iPad.";
      return;
    }
  }
  show(ui.menuScreen);
}

ui.unlockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  ui.unlockError.hidden = true;
  const value = ui.unlockInput.value;
  const ok = await isValidKey(value);
  if (!ok) {
    ui.unlockError.hidden = false;
    ui.unlockInput.value = "";
    ui.unlockInput.focus();
    return;
  }
  persistUnlock();
  ui.unlockInput.value = "";
  await enterUnlocked();
});

ui.startBtn.addEventListener("click", () => startRace());
ui.pauseBtn.addEventListener("click", () => pauseRace());
ui.resumeBtn.addEventListener("click", () => resumeRace());
ui.restartBtn.addEventListener("click", () => {
  hide(ui.pauseScreen);
  startRace();
});
ui.quitBtn.addEventListener("click", () => quitToMenu());
ui.raceAgainBtn.addEventListener("click", () => startRace());
ui.finishMenuBtn.addEventListener("click", () => quitToMenu());
ui.lockDeviceBtn.addEventListener("click", () => {
  clearUnlock();
  unlocked = false;
  racing = false;
  paused = false;
  setPlayingUI(false);
  hide(ui.menuScreen);
  show(ui.lockScreen);
  ui.unlockInput.focus();
});

async function tryQueryUnlock() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get("key") || params.get("unlock");
  if (!key) return false;
  if (!(await isValidKey(key))) return false;
  persistUnlock();
  // Remove the key from the address bar so it isn't left sitting in history.
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState({}, "", clean);
  return true;
}

// Boot
updateBestReadout();
const boot = async () => {
  if (deviceUnlocked() || (await tryQueryUnlock())) {
    await enterUnlocked();
  } else {
    show(ui.lockScreen);
    hide(ui.menuScreen);
    try {
      createWorld();
      setupControls();
      window.addEventListener("resize", onResize);
      animate();
    } catch (err) {
      // Keep the lock UI usable even if WebGL fails during warm-up.
      console.error(err);
    }
  }
};
boot();
