// cursor-canvas-title: Leo Poly Track
import {
  Button,
  Card,
  CardBody,
  H1,
  H2,
  Row,
  Spacer,
  Stack,
  Stat,
  Text,
  TextInput,
  mergeStyle,
  useCanvasState,
  useEffect,
  useHostTheme,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "cursor/canvas";

type Screen = "lock" | "menu" | "race" | "pause" | "finish";

type CarState = {
  x: number;
  y: number;
  angle: number;
  speed: number;
  progress: number;
  lastProgress: number;
  lap: number;
  hitMid: boolean;
  hitFar: boolean;
};

const TOTAL_LAPS = 3;
const TRACK_HALF = 28;
const VIEW = 520;
const MAX_SPEED = 210;
const ACCEL = 160;
const BRAKE = 240;
const DRAG = 55;
const STEER = 2.4;

const OWNER_KEYS = new Set(["leopoly", "leogshirley"]);

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function formatTime(ms: number) {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const hundredths = Math.floor((total % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

/** Closed loop control points in view coordinates. */
const WAYPOINTS: Array<[number, number]> = [
  [260, 430],
  [360, 390],
  [430, 300],
  [420, 180],
  [340, 90],
  [220, 70],
  [110, 120],
  [70, 220],
  [90, 340],
  [160, 410],
  [260, 430],
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function catmullPoint(t: number): { x: number; y: number; tx: number; ty: number } {
  const n = WAYPOINTS.length - 1;
  const u = ((t % 1) + 1) % 1;
  const scaled = u * n;
  const i = Math.min(n - 1, Math.floor(scaled));
  const local = scaled - i;
  const p0 = WAYPOINTS[Math.max(0, i - 1)];
  const p1 = WAYPOINTS[i];
  const p2 = WAYPOINTS[Math.min(n, i + 1)];
  const p3 = WAYPOINTS[Math.min(n, i + 2)];

  const t2 = local * local;
  const t3 = t2 * local;
  const x =
    0.5 *
    (2 * p1[0] +
      (-p0[0] + p2[0]) * local +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
  const y =
    0.5 *
    (2 * p1[1] +
      (-p0[1] + p2[1]) * local +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);

  // Tangent via tiny step
  const next = catmullPointRaw(((u + 0.002) % 1 + 1) % 1);
  const tx = next.x - x;
  const ty = next.y - y;
  const len = Math.hypot(tx, ty) || 1;
  return { x, y, tx: tx / len, ty: ty / len };
}

function catmullPointRaw(u: number): { x: number; y: number } {
  const n = WAYPOINTS.length - 1;
  const scaled = u * n;
  const i = Math.min(n - 1, Math.floor(scaled));
  const local = scaled - i;
  const p0 = WAYPOINTS[Math.max(0, i - 1)];
  const p1 = WAYPOINTS[i];
  const p2 = WAYPOINTS[Math.min(n, i + 1)];
  const p3 = WAYPOINTS[Math.min(n, i + 2)];
  const t2 = local * local;
  const t3 = t2 * local;
  return {
    x:
      0.5 *
      (2 * p1[0] +
        (-p0[0] + p2[0]) * local +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    y:
      0.5 *
      (2 * p1[1] +
        (-p0[1] + p2[1]) * local +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  };
}

function buildTrackPolygons(samples = 120) {
  const outer: string[] = [];
  const inner: string[] = [];
  const asphalt: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = catmullPoint(t);
    const nx = -p.ty;
    const ny = p.tx;
    outer.push(`${p.x + nx * TRACK_HALF},${p.y + ny * TRACK_HALF}`);
    inner.push(`${p.x - nx * (TRACK_HALF - 10)},${p.y - ny * (TRACK_HALF - 10)}`);
    asphalt.push(`${p.x + nx * (TRACK_HALF - 4)},${p.y + ny * (TRACK_HALF - 4)}`);
  }
  const asphaltInner: string[] = [];
  for (let i = samples; i >= 0; i--) {
    const t = i / samples;
    const p = catmullPoint(t);
    const nx = -p.ty;
    const ny = p.tx;
    asphaltInner.push(`${p.x - nx * (TRACK_HALF - 4)},${p.y - ny * (TRACK_HALF - 4)}`);
  }
  return {
    curbOuter: outer.join(" "),
    curbInner: inner.join(" "),
    asphalt: [...asphalt, ...asphaltInner].join(" "),
  };
}

function nearestProgress(x: number, y: number) {
  let bestT = 0;
  let bestD = Infinity;
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    const p = catmullPoint(t);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return { t: bestT, dist: Math.sqrt(bestD) };
}

function initialCar(): CarState {
  const p = catmullPoint(0.02);
  return {
    x: p.x,
    y: p.y,
    angle: Math.atan2(p.tx, -p.ty),
    speed: 0,
    progress: 0.02,
    lastProgress: 0.02,
    lap: 1,
    hitMid: false,
    hitFar: false,
  };
}

function HoldButton({
  label,
  active,
  primary,
  onHold,
  style,
}: {
  label: string;
  active: boolean;
  primary?: boolean;
  onHold: (down: boolean) => void;
  style?: CSSProperties;
}) {
  const theme = useHostTheme();
  const press = (down: boolean) => onHold(down);
  return (
    <div
      role="button"
      tabIndex={0}
      onPointerDown={(e: { preventDefault: () => void; pointerId: number; currentTarget: HTMLElement }) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerCancel={() => press(false)}
      onLostPointerCapture={() => press(false)}
      style={mergeStyle(
        {
          minWidth: 72,
          minHeight: 56,
          padding: "14px 16px",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          userSelect: "none",
          touchAction: "none",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: 15,
          background: primary
            ? active
              ? theme.accent.control
              : theme.accent.primary
            : active
              ? theme.fill.primary
              : theme.fill.secondary,
          color: primary ? theme.text.onAccent : theme.text.primary,
          border: primary ? "none" : `1px solid ${theme.stroke.secondary}`,
        },
        style
      )}
    >
      {label}
    </div>
  );
}

function RaceView({
  car,
  raceMs,
  bestMs,
  onPause,
  input,
  setInput,
}: {
  car: CarState;
  raceMs: number;
  bestMs: number;
  onPause: () => void;
  input: { steer: number; accel: boolean; brake: boolean };
  setInput: (
    next:
      | { steer: number; accel: boolean; brake: boolean }
      | ((prev: { steer: number; accel: boolean; brake: boolean }) => {
          steer: number;
          accel: boolean;
          brake: boolean;
        })
  ) => void;
}) {
  const theme = useHostTheme();
  const polys = useMemo(() => buildTrackPolygons(), []);
  const grass = theme.kind === "light" ? theme.category.green : theme.category.green;
  const asphalt = theme.fill.primary;
  const curb = theme.text.primary;
  const carBody = theme.category.orange;
  const cabin = theme.category.cyan;

  return (
    <Stack gap={12}>
      <Row gap={10} align="center" justify="space-between" wrap>
        <Button variant="secondary" onClick={onPause}>
          Pause
        </Button>
        <Row gap={12} wrap>
          <Stat value={`${car.lap}/${TOTAL_LAPS}`} label="Lap" />
          <Stat value={formatTime(raceMs)} label="Time" />
          <Stat value={bestMs ? formatTime(bestMs) : "—"} label="Best" />
          <Stat value={`${Math.round(car.speed)}`} label="km/h" />
        </Row>
      </Row>

      <div
        style={{
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          background: grass,
          border: `1px solid ${theme.stroke.secondary}`,
        }}
      >
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" style={{ display: "block", touchAction: "none" }}>
          <rect x={0} y={0} width={VIEW} height={VIEW} fill={grass} />
          {/* low hills */}
          <polygon points="40,80 90,30 140,80" fill={theme.category.green} opacity={0.55} />
          <polygon points="380,60 430,20 480,70" fill={theme.category.green} opacity={0.45} />
          <polygon points="20,460 70,410 130,470" fill={theme.category.green} opacity={0.4} />

          <polygon points={polys.curbOuter} fill={curb} opacity={0.9} />
          <polygon points={polys.asphalt} fill={asphalt} />
          <polygon points={polys.curbInner} fill={grass} />

          {/* start/finish */}
          {(() => {
            const p = catmullPoint(0);
            const nx = -p.ty;
            const ny = p.tx;
            return (
              <line
                x1={p.x + nx * (TRACK_HALF - 6)}
                y1={p.y + ny * (TRACK_HALF - 6)}
                x2={p.x - nx * (TRACK_HALF - 6)}
                y2={p.y - ny * (TRACK_HALF - 6)}
                stroke={theme.text.primary}
                strokeWidth={4}
              />
            );
          })()}

          <g transform={`translate(${car.x} ${car.y}) rotate(${(car.angle * 180) / Math.PI})`}>
            <rect x={-9} y={-16} width={18} height={30} rx={3} fill={carBody} />
            <rect x={-7} y={-6} width={14} height={12} rx={2} fill={cabin} />
            <rect x={-11} y={-12} width={4} height={8} fill={theme.text.primary} />
            <rect x={7} y={-12} width={4} height={8} fill={theme.text.primary} />
            <rect x={-11} y={6} width={4} height={8} fill={theme.text.primary} />
            <rect x={7} y={6} width={4} height={8} fill={theme.text.primary} />
          </g>
        </svg>
      </div>

      <Row gap={10} align="center" justify="space-between">
        <Row gap={8}>
          <HoldButton
            label="◀"
            active={input.steer < 0}
            onHold={(down) =>
              setInput((prev) => ({
                ...prev,
                steer: down ? -1 : prev.steer < 0 ? 0 : prev.steer,
              }))
            }
          />
          <HoldButton
            label="▶"
            active={input.steer > 0}
            onHold={(down) =>
              setInput((prev) => ({
                ...prev,
                steer: down ? 1 : prev.steer > 0 ? 0 : prev.steer,
              }))
            }
          />
        </Row>
        <Row gap={8}>
          <HoldButton
            label="BRAKE"
            active={input.brake}
            onHold={(down) => setInput((prev) => ({ ...prev, brake: down }))}
          />
          <HoldButton
            label="GAS"
            primary
            active={input.accel}
            onHold={(down) => setInput((prev) => ({ ...prev, accel: down }))}
          />
        </Row>
      </Row>
      <Text tone="secondary" size="small">
        Hold GAS to accelerate. Use ◀ ▶ to steer. Built for Cursor — Leo only.
      </Text>
    </Stack>
  );
}

export default function LeoPolyTrackCanvas() {
  const theme = useHostTheme();
  const [unlocked, setUnlocked] = useCanvasState("leo-unlocked", false);
  const [bestMs, setBestMs] = useCanvasState("leo-best-ms", 0);
  const [keyInput, setKeyInput] = useState("");
  const [keyError, setKeyError] = useState(false);
  const [screen, setScreen] = useState<Screen>(unlocked ? "menu" : "lock");
  const [car, setCar] = useState<CarState>(initialCar);
  const [raceMs, setRaceMs] = useState(0);
  const [input, setInput] = useState({ steer: 0, accel: false, brake: false });

  const racingRef = useRef(false);
  const pausedRef = useRef(false);
  const inputRef = useRef(input);
  const carRef = useRef(car);
  const raceMsRef = useRef(0);
  const finishHandled = useRef(false);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  useEffect(() => {
    carRef.current = car;
  }, [car]);
  useEffect(() => {
    if (unlocked && screen === "lock") setScreen("menu");
  }, [unlocked, screen]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!racingRef.current || pausedRef.current) return;

      const inp = inputRef.current;
      const c = { ...carRef.current };
      if (inp.accel) c.speed += ACCEL * dt;
      if (inp.brake) c.speed -= BRAKE * dt;
      if (!inp.accel && !inp.brake) c.speed *= Math.pow(0.25, dt);
      else c.speed -= Math.sign(c.speed || 1) * DRAG * dt;
      if (Math.abs(c.speed) < 2 && !inp.accel) c.speed = 0;
      c.speed = Math.max(-40, Math.min(MAX_SPEED, c.speed));

      const steerFactor = Math.max(0.25, Math.min(1, Math.abs(c.speed) / 80));
      c.angle += inp.steer * STEER * steerFactor * dt * Math.sign(c.speed || 1);
      c.x += Math.sin(c.angle) * c.speed * dt;
      c.y -= Math.cos(c.angle) * c.speed * dt;

      const near = nearestProgress(c.x, c.y);
      c.progress = near.t;
      if (near.dist > TRACK_HALF + 4) {
        const center = catmullPoint(near.t);
        const dx = center.x - c.x;
        const dy = center.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        c.x += (dx / len) * (near.dist - TRACK_HALF) * 2.2 * dt;
        c.y += (dy / len) * (near.dist - TRACK_HALF) * 2.2 * dt;
        c.speed *= 0.96;
      }

      if (c.progress > 0.33 && c.progress < 0.5) c.hitMid = true;
      if (c.progress > 0.66 && c.progress < 0.85) c.hitFar = true;

      if (c.progress - c.lastProgress < -0.7 && c.hitMid && c.hitFar) {
        c.lap += 1;
        c.hitMid = false;
        c.hitFar = false;
        if (c.lap > TOTAL_LAPS && !finishHandled.current) {
          finishHandled.current = true;
          racingRef.current = false;
          const finalMs = raceMsRef.current;
          setRaceMs(finalMs);
          setCar(c);
          carRef.current = c;
          setBestMs((prev) => (prev === 0 || finalMs < prev ? finalMs : prev));
          setScreen("finish");
          setInput({ steer: 0, accel: false, brake: false });
          return;
        }
      }
      c.lastProgress = c.progress;

      raceMsRef.current += dt * 1000;
      carRef.current = c;
      setCar(c);
      setRaceMs(raceMsRef.current);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [setBestMs]);

  function tryUnlock() {
    if (OWNER_KEYS.has(normalizeKey(keyInput))) {
      setUnlocked(true);
      setKeyError(false);
      setKeyInput("");
      setScreen("menu");
    } else {
      setKeyError(true);
      setKeyInput("");
    }
  }

  function startRace() {
    const next = initialCar();
    setCar(next);
    carRef.current = next;
    raceMsRef.current = 0;
    setRaceMs(0);
    finishHandled.current = false;
    setInput({ steer: 0, accel: false, brake: false });
    racingRef.current = true;
    pausedRef.current = false;
    setScreen("race");
  }

  function pauseRace() {
    if (!racingRef.current) return;
    pausedRef.current = true;
    setInput({ steer: 0, accel: false, brake: false });
    setScreen("pause");
  }

  function resumeRace() {
    pausedRef.current = false;
    setScreen("race");
  }

  function lockDevice() {
    setUnlocked(false);
    racingRef.current = false;
    pausedRef.current = false;
    setScreen("lock");
  }

  if (screen === "lock") {
    return (
      <Stack gap={16} style={{ maxWidth: 440 }}>
        <Text weight="semibold" tone="secondary" size="small">
          LEO POLY TRACK
        </Text>
        <H1>Private track</H1>
        <Text tone="secondary">
          Play inside Cursor — no Safari. This app only unlocks for Leo.
        </Text>
        <Card>
          <CardBody>
            <Stack gap={12}>
              <TextInput
                value={keyInput}
                onChange={setKeyInput}
                placeholder="Personal key"
                type="password"
              />
              <Row gap={8}>
                <Button variant="primary" onClick={tryUnlock}>
                  Unlock
                </Button>
              </Row>
              {keyError ? (
                <Text tone="secondary" style={{ color: theme.category.red }}>
                  Wrong key. Try again.
                </Text>
              ) : null}
            </Stack>
          </CardBody>
        </Card>
      </Stack>
    );
  }

  if (screen === "menu") {
    return (
      <Stack gap={16} style={{ maxWidth: 480 }}>
        <Text weight="semibold" tone="secondary" size="small">
          LEO POLY TRACK
        </Text>
        <H1>Ready to race</H1>
        <Text tone="secondary">3 laps · arcade handling · Cursor app for Leo</Text>
        <Row gap={10} wrap>
          <Stat value={bestMs ? formatTime(bestMs) : "—"} label="Personal best" />
          <Stat value={`${TOTAL_LAPS}`} label="Laps" />
        </Row>
        <Spacer />
        <Row gap={8} wrap>
          <Button variant="primary" onClick={startRace}>
            Race
          </Button>
          <Button variant="ghost" onClick={lockDevice}>
            Lock this device
          </Button>
        </Row>
      </Stack>
    );
  }

  if (screen === "pause") {
    return (
      <Stack gap={16} style={{ maxWidth: 420 }}>
        <Text weight="semibold" tone="secondary" size="small">
          PAUSED
        </Text>
        <H1>Take a breath</H1>
        <Text tone="secondary">Time {formatTime(raceMs)} · Lap {car.lap}/{TOTAL_LAPS}</Text>
        <Row gap={8} wrap>
          <Button variant="primary" onClick={resumeRace}>
            Resume
          </Button>
          <Button variant="secondary" onClick={startRace}>
            Restart
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              racingRef.current = false;
              pausedRef.current = false;
              setScreen("menu");
            }}
          >
            Menu
          </Button>
        </Row>
      </Stack>
    );
  }

  if (screen === "finish") {
    const isBest = bestMs > 0 && Math.abs(bestMs - raceMs) < 20;
    return (
      <Stack gap={16} style={{ maxWidth: 420 }}>
        <Text weight="semibold" tone="secondary" size="small">
          FINISH
        </Text>
        <H1>{isBest ? "New personal best" : "Race complete"}</H1>
        <Stat value={formatTime(raceMs)} label="Final time" tone="success" />
        <Row gap={8} wrap>
          <Button variant="primary" onClick={startRace}>
            Race again
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              racingRef.current = false;
              setScreen("menu");
            }}
          >
            Menu
          </Button>
        </Row>
      </Stack>
    );
  }

  return (
    <Stack gap={8} style={{ maxWidth: 560 }}>
      <H2>Leo Poly Track</H2>
      <RaceView
        car={car}
        raceMs={raceMs}
        bestMs={bestMs}
        onPause={pauseRace}
        input={input}
        setInput={setInput}
      />
    </Stack>
  );
}
