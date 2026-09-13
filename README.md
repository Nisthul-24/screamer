# THE SCREAMING VOLUME SLIDER™

> **“We didn’t solve a problem. We created one.”**

A deliberately useless Windows desktop app that refuses to change your master volume unless you **scream into the microphone**.

Built for hackathon demos: it looks like serious biometric audio-security tech while doing something completely unnecessary — and it **actually** controls Windows master volume.

---

## Features

- **Scream-gated volume control** — slider requests are blocked until vocal authorization succeeds
- **Real Windows master volume** via Core Audio (PowerShell + C# COM interop)
- **Live scream meter** using Web Audio API (RMS/peak intensity — no speech recognition)
- Required scream scales with volume delta (big changes demand ridiculous rage)
- Whisper rejection, combo system, cooldown, fake “security levels”
- Achievements, local leaderboard, statistics, scream history
- Settings, microphone test, onboarding, Demo Mode, Hackathon pitch page
- Optional synthesized sound effects (no copyrighted music)
- Privacy-first: mic only during scream/test; no recordings stored

---

## Technology stack

| Layer | Tech |
|--------|------|
| Desktop shell | Electron |
| UI | HTML / CSS / JavaScript (ES modules) |
| Mic analysis | Web Audio API |
| Volume control | Windows Core Audio (`IAudioEndpointVolume`) via PowerShell |
| Persistence | `localStorage` |

---

## Installation

**Requirements**

- Windows 10 or 11
- [Node.js](https://nodejs.org/) 18+ (for development)
- A working microphone
- Permission to run PowerShell scripts (the app uses `-ExecutionPolicy Bypass` only for its temp helper script)

```bash
cd "path/to/scream cursor"
npm install
```

---

## How to run

### Development

```bash
npm start
```

With DevTools:

```bash
npm run dev
```

### Production build (Windows executable)

```bash
npm run build
```

Outputs under `dist/`, including a portable build named roughly:

`TheScreamingVolumeSlider.exe`

Other useful scripts:

```bash
npm run build:dir   # unpacked directory build
npm run pack        # portable target
```

---

## How microphone detection works

1. Mic stays **off** while idle.
2. When you move the volume slider to a new value, the app **does not** change system volume.
3. It enters **SCREAM MODE** and requests mic access once.
4. Web Audio measures short-window **RMS + peak** amplitude, smoothed into a **Scream Power** score (0–100).
5. Normal talking maps low; loud screaming maps high (not scientific dB).
6. After a short listen window, peak score is compared to the required threshold.
7. Mic tracks are stopped immediately — nothing is recorded or uploaded.

---

## How volume control works

The Electron main process runs a temporary PowerShell helper that loads a small C# Core Audio wrapper:

- `get` → current master volume percent
- `set N` → set master volume to `N` (0–100)

The renderer only calls `setVolume` **after** a successful scream. Failed attempts leave the previous volume unchanged and snap the slider back.

---

## Core state machine

```
IDLE → REQUESTED → SCREAMING → SUCCESS → COOLDOWN → IDLE
                              ↘ FAILED → IDLE
                              ↘ ERROR
```

---

## Project structure

```
├── electron/
│   ├── main.js          # BrowserWindow + IPC
│   ├── preload.js       # safe bridge API
│   └── volume.js        # Windows master volume helper
├── renderer/
│   ├── index.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js           # UI + flow controller
│       ├── state.js         # state machine helpers
│       ├── audio.js         # scream analyzer
│       ├── storage.js       # local persistence
│       ├── achievements.js
│       ├── stats.js
│       ├── messages.js
│       └── sounds.js
├── package.json
└── README.md
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Mic permission denied | Allow microphone for the app in Windows Privacy settings |
| “Microphone not found” | Plug in a mic, pick it in Settings → Test microphone |
| Volume doesn’t change | Confirm PowerShell can run; try `npm start` again; check default playback device |
| Slider snaps back | That’s intentional until you scream hard enough |
| Fonts look plain offline | UI falls back to system sans-serif without Google Fonts |

---

## Privacy

- Microphone is used **only** during Scream Mode or an explicit mic test.
- Audio is processed **locally** for intensity only.
- **No recordings** are saved or uploaded.
- Stats/achievements stay in local storage on your machine.

---

## Hackathon demo flow (~60 seconds)

1. Show current volume (~30%).
2. Drag slider to **70%** → “BIOMETRIC VOCAL AUTHENTICATION REQUIRED”.
3. Scream → meter rises → authorization accepted → Windows volume becomes **70%**.
4. Drag to **100%** → extreme / max scream requirement.
5. Succeed → “terrible decision” copy + achievement toast.
6. Flash combo / leaderboard / Hackathon page punchline.

---

## License

MIT — scream responsibly (or don’t; that’s kind of the point).
