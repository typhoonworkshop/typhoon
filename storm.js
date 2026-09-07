export const config = {
  numOfLines: 29,
  fontSizeRatios: [0.22, 0.23, 0.24, 0.25, 0.27, 0.28, 0.31, 0.34, 0.38, 0.43, 0.49, 0.58, 0.69, 0.82, 1.00, 0.82, 0.69, 0.58, 0.49, 0.43, 0.38, 0.34, 0.31, 0.28, 0.27, 0.25, 0.24, 0.23, 0.22],
  centerRow: 14,
  centerRatio: 0.75,
  minLines: 1,
  fillBf: 9,
  rowFeather: 0.12,
};

export const tape = {
  chars: [],
  cumWidths: [0],
};

let _mSpan = null;
const _wCache = new Map();
let _containerFontSize = null;

function _measure(ch) {
  let w = _wCache.get(ch);
  if (w !== undefined) return w;
  if (!_mSpan) {
    _mSpan = document.createElement('span');
    _mSpan.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;white-space:pre;' +
      'font-family:"Source Serif 4",serif;' +
      'visibility:hidden;pointer-events:none;';
    document.body.appendChild(_mSpan);
  }
  if (!_containerFontSize) {
    const container = document.getElementById('container');
    _containerFontSize = container
      ? getComputedStyle(container).fontSize
      : (window.innerWidth * 0.04) + 'px';
  }
  _mSpan.style.fontSize = _containerFontSize;
  _mSpan.textContent = ch;
  w = _mSpan.getBoundingClientRect().width || 6;
  _wCache.set(ch, w);
  return w;
}

function _curlyQuotes(s) {
  s = s.replace(/(\w)'(\w)/g, '$1\u2019$2');
  s = s.replace(/(^|[\s(\[{\u2014\u2013\-])"/g, '$1\u201C');
  s = s.replace(/"/g, '\u201D');
  s = s.replace(/(^|[\s(\[{\u2014\u2013\-])'/g, '$1\u2018');
  s = s.replace(/'/g, '\u2019');
  return s;
}

export function appendToTape(text) {
  text = _curlyQuotes(text);
  const startIdx = tape.chars.length;
  for (const ch of text) {
    tape.chars.push(ch);
    tape.cumWidths.push(tape.cumWidths[tape.cumWidths.length - 1] + _measure(ch));
  }
  return { startIdx, endIdx: tape.chars.length };
}

function _charAt(tapePx) {
  const c = tape.cumWidths;
  const n = c.length - 1;
  if (n <= 0 || tapePx <= 0) return 0;
  if (tapePx >= c[n]) return n - 1;
  let lo = 0, hi = n;
  while (lo < hi - 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= tapePx) lo = m; else hi = m;
  }
  return lo;
}

let _scrollers = [];
let _inners = [];
let _spans  = [];

export function initRows(container) {
  const R = config.fontSizeRatios;
  const mask = container.querySelector('#mask');
  for (let i = 0; i < config.numOfLines; i++) {
    const r = R[i];
    const sc = document.createElement('div');
    sc.className = 'scroller';
    sc.id = `scroll${i}`;
    sc.style.cssText =
      `font-size:${(r*100).toFixed(2)}%;` +
      `line-height:calc(var(--fontsize) * 1.5 * ${r});` +
      `height:calc(var(--fontsize) * 1.5 * ${r});`;
    const inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;top:0;left:0;will-change:transform;';
    sc.appendChild(inner);
    if (mask) container.insertBefore(sc, mask); else container.appendChild(sc);
    _scrollers.push(sc);
    _inners.push(inner);
    _spans.push([]);
  }
}

let _vwCache = 0;
function _getVW() {
  if (_vwCache > 0) return _vwCache;
  _vwCache = _scrollers[0]?.clientWidth || window.innerWidth;
  return _vwCache;
}

function _rangesPx(px) {
  const vw = _getVW();
  const R  = config.fontSizeRatios;
  const c  = config.centerRow;
  const r  = new Array(config.numOfLines);

  r[c] = [px - vw * config.centerRatio, px + vw * (1 - config.centerRatio)];

  for (let i = c - 1; i >= 0; i--) {
    const w = vw / R[i];
    r[i] = [r[i + 1][0] - w, r[i + 1][0]];
  }
  for (let i = c + 1; i < config.numOfLines; i++) {
    const w = vw / R[i];
    r[i] = [r[i - 1][1], r[i - 1][1] + w];
  }
  return r;
}

function _ranges(playIdx) {
  const px = tape.cumWidths[Math.min(playIdx, tape.chars.length - 1)] ?? 0;
  return _rangesPx(px);
}

export function populateRows(startIdx, endIdx) {
  const vw   = _getVW();
  const rA   = _ranges(startIdx);
  const rB   = _ranges(endIdx);
  const PAD_BACK  = vw * 0.75;
  const PAD_AHEAD = vw * 2.5;

  for (let ri = 0; ri < config.numOfLines; ri++) {
    const scale = config.fontSizeRatios[ri];

    const pxFrom = Math.min(rA[ri][0], rB[ri][0]) - PAD_BACK;
    const pxTo   = Math.max(rA[ri][1], rB[ri][1]) + PAD_AHEAD;

    const cFrom = Math.max(0, _charAt(pxFrom));
    const cTo   = Math.min(tape.chars.length, _charAt(pxTo) + 2);
    if (cFrom >= cTo) continue;

    let arr  = _spans[ri];

    if (arr.length > 0 &&
        (cFrom > +arr[arr.length - 1].dataset.ci + 1 || cTo < +arr[0].dataset.ci)) {
      for (const sp of arr) sp.remove();
      arr = _spans[ri] = [];
    }

    if (arr.length === 0) {
      const frag = document.createDocumentFragment();
      for (let j = cFrom; j < cTo; j++) {
        const sp = _mkSpan(j, scale);
        frag.appendChild(sp);
        arr.push(sp);
      }
      _inners[ri].appendChild(frag);
      continue;
    }

    const exMin = +arr[0].dataset.ci;
    const exMax = +arr[arr.length - 1].dataset.ci;

    if (cFrom < exMin) {
      const end  = Math.min(exMin, cTo);
      const frag = document.createDocumentFragment();
      const pre  = [];
      for (let j = cFrom; j < end; j++) {
        const sp = _mkSpan(j, scale);
        frag.appendChild(sp);
        pre.push(sp);
      }
      _inners[ri].insertBefore(frag, _inners[ri].firstChild);
      _spans[ri] = pre.concat(arr);
    }

    const appFrom = Math.max(exMax + 1, cFrom);
    if (appFrom < cTo) {
      const frag = document.createDocumentFragment();
      for (let j = appFrom; j < cTo; j++) {
        const sp = _mkSpan(j, scale);
        frag.appendChild(sp);
        _spans[ri].push(sp);
      }
      _inners[ri].appendChild(frag);
    }
  }
}

function _mkSpan(ci, scale) {
  const sp = document.createElement('span');
  sp.className = 'scroll-item';
  sp.textContent = tape.chars[ci];
  sp.dataset.ci  = ci;
  sp.style.transform = `translateX(${tape.cumWidths[ci] * scale}px)`;
  return sp;
}

let _probTo  = 0;
let _probCur = 0;

const PROB_TAU = 3.0;

export function setProbStorm(prob) {
  _probTo = prob;
}

export function getProbStorm() {
  return _probCur;
}

export function applyRowVisibility(p = _probCur) {
  const half = (config.minLines - 1) / 2;
  const maxD = config.centerRow;
  const fill = Math.max(0.01, config.fillBf / 12);
  for (let i = 0; i < config.numOfLines; i++) {
    const d = Math.abs(i - config.centerRow);
    let o = 1;
    if (d > half) {
      const t = (d - half) / Math.max(1e-6, maxD - half);
      o = Math.min(1, Math.max(0, (p / fill - t) / config.rowFeather + 1));
    }
    const el = _scrollers[i];
    if (!el) continue;
    const v = o.toFixed(3);
    if (el._op !== v) { el.style.opacity = v; el._op = v; }
  }
}

let _raf          = null;
let _live         = false;
let _t0           = null;
let _pausedAt     = null;
let _iStart       = 0;
let _iEnd         = 0;
let _dur          = 0;
let _pruneCounter = 0;
let _onNearEnd    = null;
let _nearEndFired = false;
let _nearEndLeadS = 0.12;

function _snapToStart() {
  if (!_inners.length) return;
  const pxStart = tape.cumWidths[_iStart];
  const rsS = _rangesPx(pxStart);
  const R   = config.fontSizeRatios;
  for (let i = 0; i < config.numOfLines; i++) {
    const el = _inners[i];
    el.style.transition = 'none';
    el.style.transform  = `translateX(${-rsS[i][0] * R[i]}px)`;
  }
  if (_inners[0]) void _inners[0].offsetWidth;
}

function _applyScrollTransition(dur) {
  const pxEnd = tape.cumWidths[Math.min(_iEnd, tape.chars.length)];
  const rsE = _rangesPx(pxEnd);
  const R   = config.fontSizeRatios;
  for (let i = 0; i < config.numOfLines; i++) {
    const el = _inners[i];
    el.style.transition = `transform ${dur}s linear`;
    el.style.transform  = `translateX(${-rsE[i][0] * R[i]}px)`;
  }
}

function _curPx() {
  if (_t0 == null || _dur <= 0) return tape.cumWidths[_iStart] ?? 0;
  const ref = _pausedAt ?? performance.now();
  const p = Math.min(1, (ref - _t0) / 1000 / _dur);
  const pxStart = tape.cumWidths[_iStart];
  const pxEnd   = tape.cumWidths[Math.min(_iEnd, tape.chars.length)];
  return pxStart + p * (pxEnd - pxStart);
}

function _tick() {
  if (!_live) return;
  if (_pausedAt != null) { _raf = requestAnimationFrame(_tick); return; }
  const now = performance.now();
  const dtWall = Math.min(1.0, Math.max(0, (now - (_tick._prev ?? now)) / 1000));
  _tick._prev = now;
  _probCur += (_probTo - _probCur) * (1 - Math.exp(-dtWall / PROB_TAU));
  applyRowVisibility();
  if (!_nearEndFired && _t0 != null && _dur > 0 && _onNearEnd) {
    if ((now - _t0) / 1000 >= _dur - _nearEndLeadS) {
      _nearEndFired = true;
      const cb = _onNearEnd;
      _onNearEnd = null;
      cb();
    }
  }
  if (now - (_tick._lastPop ?? 0) > 400 || dtWall > 0.4) {
    const pi = _charAt(_curPx());
    populateRows(pi, pi);
    _tick._lastPop = now;
    if (++_pruneCounter % 4 === 0) _pruneOldSpans(pi);
  }
  _raf = requestAnimationFrame(_tick);
}

function _startTransition() {
  if (_t0 != null) return;
  _t0 = performance.now();
  _applyScrollTransition(_dur);
}

export function snapTo(tapeStart, tapeEnd) {
  _iStart = tapeStart;
  _iEnd   = tapeEnd;
  _snapToStart();
}

export function startAnimation(tapeStart, tapeEnd, duration, onNearEnd = null, leadS = 0.12) {
  _live         = true;
  _iStart       = tapeStart;
  _iEnd         = tapeEnd;
  _dur          = duration;
  _t0           = null;
  _onNearEnd    = onNearEnd;
  _nearEndFired = false;
  _nearEndLeadS = leadS;
  _pausedAt     = null;
  cancelAnimationFrame(_raf);

  _snapToStart();
  _startTransition();

  _raf = requestAnimationFrame(_tick);
}

export function continueAnimation(tapeStart, tapeEnd, duration, onNearEnd = null, leadS = 0.12) {
  _iStart       = tapeStart;
  _iEnd         = tapeEnd;
  _dur          = duration;
  _t0           = null;
  _onNearEnd    = onNearEnd;
  _nearEndFired = false;
  _nearEndLeadS = leadS;

  if (_pausedAt != null) {
    _snapToStart();
    _t0 = performance.now();
    _pausedAt = _t0;
    return;
  }

  _startTransition();

  if (!_live) {
    _live = true;
    _raf  = requestAnimationFrame(_tick);
  }
}

export function stopAnimation() {
  _live      = false;
  _pausedAt  = null;
  _onNearEnd = null;
  cancelAnimationFrame(_raf);
  _raf = null;
}

export function relayout() {
  _containerFontSize = null;
  _vwCache = 0;
  _wCache.clear();

  tape.cumWidths = [0];
  for (const ch of tape.chars) {
    tape.cumWidths.push(tape.cumWidths[tape.cumWidths.length - 1] + _measure(ch));
  }

  for (let ri = 0; ri < config.numOfLines; ri++) {
    const scale = config.fontSizeRatios[ri];
    for (const sp of _spans[ri]) {
      const ci = +sp.dataset.ci;
      sp.style.transform = `translateX(${tape.cumWidths[ci] * scale}px)`;
    }
  }

  if (!_resumeTransition()) _snapToStart();
}

function _resumeTransition() {
  if (!_live || _t0 == null || _dur <= 0) return false;
  const ref       = _pausedAt ?? performance.now();
  const elapsed   = (ref - _t0) / 1000;
  const remaining = Math.max(0.05, _dur - elapsed);
  const pxStart   = tape.cumWidths[_iStart];
  const pxEnd     = tape.cumWidths[Math.min(_iEnd, tape.chars.length)];
  const pxCur     = pxStart + Math.min(1, elapsed / _dur) * (pxEnd - pxStart);
  const rsCur = _rangesPx(pxCur);
  const rsEnd = _rangesPx(pxEnd);
  const R = config.fontSizeRatios;
  for (let i = 0; i < config.numOfLines; i++) {
    const el = _inners[i];
    el.style.transition = 'none';
    el.style.transform  = `translateX(${-rsCur[i][0] * R[i]}px)`;
    if (_pausedAt != null) continue;
    void el.offsetWidth;
    el.style.transition = `transform ${remaining}s linear`;
    el.style.transform  = `translateX(${-rsEnd[i][0] * R[i]}px)`;
  }
  return true;
}

export function getPlayIdx() {
  return _charAt(_curPx());
}

export function getRowTx(ri) {
  return -_rangesPx(_curPx())[ri][0] * config.fontSizeRatios[ri];
}

export function pauseAnimation() {
  if (!_live || _t0 == null || _pausedAt != null) return;
  _pausedAt = performance.now();
  _resumeTransition();
}

function _pruneOldSpans(playIdx) {
  const rs = _ranges(playIdx);
  for (let ri = 0; ri < config.numOfLines; ri++) {
    const cutoff = _charAt(rs[ri][0]) - 100;
    if (cutoff <= 0) continue;
    const arr = _spans[ri];
    const cap = arr.length > 800 ? 200 : 40;
    let cut = 0;
    while (cut < arr.length && cut < cap && +arr[cut].dataset.ci < cutoff) {
      arr[cut].remove();
      cut++;
    }
    if (cut > 0) _spans[ri] = arr.slice(cut);
  }
}
