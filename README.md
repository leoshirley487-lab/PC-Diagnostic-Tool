# Leo Poly Track

A private, Poly Track–style low-poly racer for Leo Shirley — built for iPad Safari.

## Play on iPad

1. Open the hosted page (GitHub Pages or any static host for this repo).
2. Enter your personal key when prompted.
3. Tap **Race**. Use on-screen **◀ ▶**, **GAS**, and **BRAKE**.
4. Complete **3 laps**. Your best time is saved on this device.

### Personal key

This build only unlocks for you:

- Primary key: `leopoly`
- Backup: your email local-part (`leogshirley`)

After a successful unlock, this iPad stays unlocked until you tap **Lock this device**.

## Desktop controls

- Steer: `A` / `D` or arrow keys
- Accelerate: `W` or ↑
- Brake: `S`, ↓, or Space
- Pause: `Esc`

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` (module imports need a local server, not `file://`).
