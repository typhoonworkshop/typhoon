let _device = null;
let _params = null;
let _bedEl = null;

const EXPORT_URL = new URL('./rnbo/patch.export.json', import.meta.url).href;
const BED_URL    = new URL('./base-loop.mp3', import.meta.url).href;

async function _loadLib(version) {
  const urls = [
    new URL('./rnbo/rnbo.min.js', import.meta.url).href,
    `https://c74-public.nyc3.digitaloceanspaces.com/rnbo/${encodeURIComponent(version)}/rnbo.min.js`,
    'https://cdn.cycling74.com/rnbo/latest/rnbo.min.js',
  ];
  let lastErr;
  for (const url of urls) {
    try {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = url; s.onload = res; s.onerror = () => rej(new Error(`failed: ${url}`));
        document.head.appendChild(s);
      });
      const got = window.RNBO?.version;
      if (got && got !== version) {
        console.warn(`[stormsound] rnbo.min.js ${got} != patch ${version}, trying next source`);
        continue;
      }
      return;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('could not load rnbo.min.js');
}

export async function initStormSound(audioCtx) {
  const patcher = await fetch(EXPORT_URL).then(r => {
    if (!r.ok) throw new Error(`patch.export.json ${r.status}`);
    return r.json();
  });
  const version = patcher?.desc?.meta?.rnboversion;
  if (!version) throw new Error('export missing desc.meta.rnboversion');
  await _loadLib(version);
  const device = await window.RNBO.createDevice({ context: audioCtx, patcher });
  _device = device;
  _params = {
    ratio: device.parametersById.get('ratio'),
    bits:  device.parametersById.get('bits'),
    tts:   device.parametersById.get('tts'),
  };
  _buildBed(audioCtx, device);
  _startControlClock();
  return device;
}

function _buildBed(ctx, device) {
  const el = new Audio(BED_URL);
  el.loop = true;
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  _bedEl = el;
  ctx.createMediaElementSource(el).connect(device.node);
}

export function startBed() {
  if (!_bedEl) return false;
  _bedEl.play().catch(e => {
    if (e?.name !== 'AbortError') console.warn('[stormsound] bed play blocked', e);
  });
  return true;
}

export function pauseBed()  { if (_bedEl) _bedEl.pause(); }
export function resumeBed() { startBed(); }

export function connectStormOutput(dest) {
  if (!_device) return false;
  _device.node.connect(dest);
  return true;
}

const GLIDE_MS = 20000;
const CLOCK_MS = 300;

let _glideFrom = 1, _glideTo = 1, _glideT0 = 0;

function _levelNow() {
  const t = (performance.now() - _glideT0) / GLIDE_MS;
  if (t >= 1) return _glideTo;
  return _glideFrom + (_glideTo - _glideFrom) * Math.max(0, t);
}

function _applyLevel(level) {
  const v = ((5 - level) / 4) * 0.9 + 0.1;
  _params.ratio.value = v;
  _params.bits.value = Math.trunc(24 * v);
}

function _startControlClock() {
  _applyLevel(_levelNow());
  setInterval(() => _applyLevel(_levelNow()), CLOCK_MS);
}

export function setStorm(prob) {
  if (!_params) return false;
  const p = Math.min(1, Math.max(0, prob));
  _glideFrom = _levelNow();
  _glideTo = Math.min(5, Math.floor(p * 5) + 1);
  _glideT0 = performance.now();
  return true;
}

export function setTts(on) {
  if (!_params) return false;
  _params.tts.value = on ? 1 : 0;
  return true;
}
