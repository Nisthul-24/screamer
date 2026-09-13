# THE SCREAMING VOLUME SLIDER™ 🔊🎤

## Basic Details

### Team Name: Screamer

### Team Members

* Team Lead: Nisthul

### Project Description

A Windows desktop app that looks like serious biometric audio-security tech — but the only way to change your master volume is to scream. The slider does not set the volume; **your scream average becomes the volume**.

### The Problem (that doesn't exist)

Traditional volume controls require almost zero physical effort. Changing volume is far too easy, quiet, and socially acceptable.

### The Solution (that nobody asked for)

Voice-activated physical effort authorization. Drag the slider to request a change, then scream. The app measures scream intensity and sets Windows master volume to the **average scream power** (0–100). Louder sustained screaming → louder volume. Whispering is rejected.

## Technical Details

### Technologies/Components Used

For Software:

* JavaScript / HTML / CSS
* Electron
* Web Audio API (microphone intensity / RMS)
* `loudness` (real Windows master volume control)
* localStorage (stats, achievements, settings)

### Implementation

For Software:

# Installation

```bash
npm install
```

# Run

```bash
npm start
```

# Build Windows executable

```bash
npm run build
```

### Project Documentation

For Software:

# How it works

1. App reads current Windows master volume.
2. User moves the slider (this is only an *intent* — volume does not change yet).
3. Mic activates for a short scream window.
4. App computes average scream intensity (not speech recognition; no recordings saved).
5. Windows master volume is set to that average.
6. Mic turns off immediately after.

# Project structure

```
electron/     # main process + volume control
renderer/     # UI, scream analysis, game features
package.json  # scripts: start / build
```

### Project Demo

# Video

_Add your demo video link here_

## Team Contributions

* Nisthul: Full stack — Electron app, scream analysis, Windows volume control, UI

---

Made with ❤️ at TinkerHub Useless Projects

> **“We didn’t solve a problem. We created one.”**

## Privacy

Audio is analyzed locally. Recordings are never stored. The microphone is only used during scream mode or an explicit mic test.
