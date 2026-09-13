/**
 * Windows master volume control via the `loudness` package.
 * Falls back to VolumeTool.exe if loudness fails.
 */

const path = require('path');
const { execFile } = require('child_process');

let loudness = null;
try {
  loudness = require('loudness');
} catch {
  loudness = null;
}

function runTool(args) {
  return new Promise((resolve, reject) => {
    const exe = path.join(__dirname, 'VolumeTool.exe');
    execFile(exe, args, { windowsHide: true, timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error((stderr && stderr.trim()) || err.message));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

async function getVolume() {
  if (loudness) {
    const value = await loudness.getVolume();
    const n = Math.round(Number(value));
    if (Number.isNaN(n) || n < 0 || n > 100) {
      throw new Error(`Invalid volume reading: ${value}`);
    }
    return n;
  }
  const out = await runTool(['get']);
  const value = parseInt(out, 10);
  if (Number.isNaN(value)) throw new Error(`Invalid volume reading: ${out}`);
  return value;
}

async function setVolume(percent) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent))));
  if (Number.isNaN(clamped)) {
    throw new Error(`Invalid volume value: ${percent}`);
  }
  if (loudness) {
    await loudness.setVolume(clamped);
    return getVolume();
  }
  const out = await runTool(['set', String(clamped)]);
  const value = parseInt(out, 10);
  if (Number.isNaN(value)) throw new Error(`Failed to set volume: ${out}`);
  return value;
}

async function getMute() {
  if (loudness && typeof loudness.getMuted === 'function') {
    return !!(await loudness.getMuted());
  }
  try {
    const out = await runTool(['getmute']);
    return out === '1';
  } catch {
    return false;
  }
}

async function setMute(muted) {
  if (loudness && typeof loudness.setMuted === 'function') {
    await loudness.setMuted(!!muted);
    return getMute();
  }
  const out = await runTool(['setmute', muted ? '1' : '0']);
  return out === '1';
}

module.exports = {
  getVolume,
  setVolume,
  getMute,
  setMute
};
