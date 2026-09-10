# Leo Poly Track

A private, Poly Track–style low-poly racer for Leo Shirley — built for iPad Safari.

## Play on iPad

Live site: [https://leoshirley487-lab.github.io/PC-Diagnostic-Tool/](https://leoshirley487-lab.github.io/PC-Diagnostic-Tool/)

1. Open that link in **Safari** on your iPad.
2. Enter your personal key when prompted.
3. Tap **Race**. Hold **GAS**, steer with **◀ ▶**.
4. Complete **3 laps**. Your best time is saved on this device.

### Personal key

This build only unlocks for you:

- Primary key: `leopoly`
- Backup: your email local-part (`leogshirley`)

After a successful unlock, this iPad stays unlocked until you tap **Lock this device**.

You can also open once with `?key=leopoly` — the key is checked, saved to this device, then stripped from the address bar.

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
