# THE SCREAMING VOLUME SLIDER™ 🔊🎤

## Basic Details

### Team Name: Screamer

### Team Members

* Team Lead: Nisthul krishna

### Project Description

A Chrome extension (plus optional Windows Electron app) that looks like serious biometric audio-security tech — but the only way to change volume is to scream. **You don’t pick the number; your scream average becomes the volume.**

Works while watching **YouTube** and other sites with video/audio: when you try to change the player volume, the scream overlay appears.

### The Problem (that doesn't exist)

Traditional volume controls require almost zero physical effort. Changing volume is far too easy, quiet, and socially acceptable.

### The Solution (that nobody asked for)

Voice-activated physical effort authorization. Try to change volume → scream → the app/extension measures scream intensity and sets volume to the **average scream power** (0–100%). Louder sustained screaming → louder volume. Whispering is rejected.

## Technical Details

### Technologies/Components Used

For Software:

* JavaScript / HTML / CSS
* **Chrome Extension (Manifest V3)** — primary for YouTube / web video
* Electron (optional Windows desktop app for system master volume)
* Web Audio API (microphone intensity / RMS)
* Page-world volume hook on `HTMLMediaElement.prototype.volume`
* `loudness` (Electron only — Windows master volume)

---

## Chrome extension (YouTube / any video site)

### Install (unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `chrome-extension` folder in this repo
5. Open YouTube (or Netflix, etc.), play a video, and try to change the volume
6. Allow microphone when prompted
7. Scream — volume becomes your scream average

### Toggle

Click the extension icon → uncheck **Extension active** to temporarily restore normal volume control.

### How it works

1. An injected page script hooks `HTMLMediaElement.volume` (so YouTube’s own player is covered).
2. When you interact with a volume control, the next volume change is blocked.
3. The extension overlay opens and listens on the mic for ~2.8s.
4. Average scream intensity (0–100) is applied as the media volume.
5. Mic access stops immediately after.

### Project structure

```
chrome-extension/
  manifest.json   # MV3 extension manifest
  inject.js       # runs in page world — hooks video/audio volume
  content.js      # scream overlay + mic analysis
  content.css     # overlay styles
  popup.html/js   # enable/disable + instructions
  icons/          # extension icons
```

---

## Electron desktop app (optional — Windows system volume)

```bash
npm install
npm start
```

Build exe:

```bash
npm run build
```

This version controls **Windows master volume** (not just the browser tab).

```
electron/     # main process + volume control
renderer/     # desktop UI
```

---

### Project Demo

# Video

_Add your demo video link here_

## Team Contributions

* Nisthul: Full stack — Chrome extension, Electron app, scream analysis, volume control, UI

---

Made with ❤️ at TinkerHub Useless Projects

> **“We didn’t solve a problem. We created one.”**

## Privacy

Microphone is used **only** during scream mode. Audio is analyzed locally. Recordings are never stored.
