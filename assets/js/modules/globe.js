/**
 * Interactive 3D orthographic dot globe for the Locations section.
 *
 * Projects precomputed spherical land dots onto a 2D canvas centered on Europe,
 * highlights the UK (GB), Bulgaria (BG), Romania (RO) and Greece (GR) in the
 * brand Ember accent, draws a 3D great-circle arc between the London and Sofia
 * headquarters, and positions accessible HTML pin buttons + tooltips over the
 * projected city coordinates.
 */
import { WORLD_DOTS, HIGHLIGHT_DOTS } from './globe-data.js';

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

// Default camera orientation centered between the UK and SE Europe.
const DEFAULT_LAT = 46.5;
const DEFAULT_LON = 12.5;
const ZOOM = 1.62;

function latLonToVec3(latDeg, lonDeg) {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const cosPhi = Math.cos(phi);
  return {
    x: cosPhi * Math.sin(lam),
    y: Math.sin(phi),
    z: cosPhi * Math.cos(lam),
  };
}

function unpackDots(flat, country) {
  const out = new Array(flat.length / 2);
  for (let i = 0, j = 0; i < flat.length; i += 2, j++) {
    const v = latLonToVec3(flat[i] * 0.1, flat[i + 1] * 0.1);
    out[j] = { x: v.x, y: v.y, z: v.z, country };
  }
  return out;
}

// Great-circle interpolation between two unit vectors on the sphere.
function slerpVec3(a, b, t) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  const omega = Math.acos(dot);
  if (omega < 1e-5) return { x: a.x, y: a.y, z: a.z };
  const sinOmega = Math.sin(omega);
  const wA = Math.sin((1 - t) * omega) / sinOmega;
  const wB = Math.sin(t * omega) / sinOmega;
  return {
    x: a.x * wA + b.x * wB,
    y: a.y * wA + b.y * wB,
    z: a.z * wA + b.z * wB,
  };
}

export function initGlobe() {
  const root = document.querySelector('[data-globe]');
  if (!root) return;

  const canvas = root.querySelector('[data-globe-canvas]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const section = root.closest('.locations') || document;
  const markerEls = Array.from(root.querySelectorAll('[data-globe-marker]'));
  const countryEls = Array.from(section.querySelectorAll('[data-globe-country]'));

  // Precompute 3D unit vectors once at startup.
  const worldPts = unpackDots(WORLD_DOTS, null);
  const highlightPts = [
    ...unpackDots(HIGHLIGHT_DOTS.GB || [], 'GB'),
    ...unpackDots(HIGHLIGHT_DOTS.BG || [], 'BG'),
    ...unpackDots(HIGHLIGHT_DOTS.RO || [], 'RO'),
    ...unpackDots(HIGHLIGHT_DOTS.GR || [], 'GR'),
  ];

  // Build marker descriptors from DOM attributes.
  const markers = markerEls.map((el) => {
    const id = el.getAttribute('data-globe-marker');
    const country = el.getAttribute('data-country') || '';
    const lat = parseFloat(el.getAttribute('data-lat')) || 0;
    const lon = parseFloat(el.getAttribute('data-lon')) || 0;
    const pin = el.querySelector('[data-globe-pin]');
    return {
      id,
      country,
      lat,
      lon,
      vec: latLonToVec3(lat, lon),
      el,
      pin,
    };
  });

  // Precompute great-circle arc points between London and Sofia if both exist.
  const arcPts = [];
  if (markers.length >= 2) {
    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      arcPts.push(slerpVec3(markers[0].vec, markers[1].vec, i / steps));
    }
  }

  // Precompute graticule lines (parallels every 15 deg, meridians every 15 deg).
  const graticuleLines = [];
  for (let lat = -60; lat <= 75; lat += 15) {
    const ring = [];
    for (let lon = -180; lon <= 180; lon += 5) ring.push(latLonToVec3(lat, lon));
    graticuleLines.push(ring);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const meridian = [];
    for (let lat = -75; lat <= 75; lat += 4) meridian.push(latLonToVec3(lat, lon));
    graticuleLines.push(meridian);
  }

  // Theme palette read from tokens.css.
  const palette = {
    surfaceInner: '#FFFFFF',
    surfaceOuter: '#EAE4D7',
    rim: 'rgba(30, 41, 59, 0.22)',
    graticule: 'rgba(30, 41, 59, 0.07)',
    dot: 'rgba(30, 41, 59, 0.34)',
    highlight: '#D9532F',
    highlightGlow: 'rgba(217, 83, 47, 0.24)',
    ambient: 'rgba(217, 83, 47, 0.12)',
  };

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const get = (prop, fallback) => cs.getPropertyValue(prop).trim() || fallback;
    palette.surfaceInner = get('--globe-surface-inner', palette.surfaceInner);
    palette.surfaceOuter = get('--globe-surface-outer', palette.surfaceOuter);
    palette.rim = get('--globe-rim', palette.rim);
    palette.graticule = get('--globe-graticule', palette.graticule);
    palette.dot = get('--globe-dot', palette.dot);
    palette.highlight = get('--globe-highlight', palette.highlight);
    palette.highlightGlow = get('--globe-highlight-glow', palette.highlightGlow);
    palette.ambient = get('--globe-ambient', palette.ambient);
  }

  // Camera state (in degrees).
  let camLat = DEFAULT_LAT;
  let camLon = DEFAULT_LON;
  let targetLat = DEFAULT_LAT;
  let targetLon = DEFAULT_LON;

  // Interaction state.
  let isDragging = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLat = DEFAULT_LAT;
  let dragStartLon = DEFAULT_LON;

  let activeCountry = null;
  let hoveredMarkerId = null;
  let pinnedMarkerId = null;

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = reducedQuery.matches;
  let visible = true;
  let raf = 0;
  let startTime = performance.now();

  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, root.clientWidth);
    height = Math.max(1, root.clientHeight);
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function updateMarkerStates() {
    const openId = hoveredMarkerId || pinnedMarkerId;
    markers.forEach((m) => {
      const isOpen = m.id === openId;
      const isPinned = m.id === pinnedMarkerId;
      if (isOpen) m.el.setAttribute('data-open', '');
      else m.el.removeAttribute('data-open');

      if (isPinned) m.el.setAttribute('data-pinned', '');
      else m.el.removeAttribute('data-pinned');

      if (m.pin) m.pin.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    const highlightedCode = activeCountry || (openId ? (markers.find((m) => m.id === openId) || {}).country : null);
    countryEls.forEach((el) => {
      const code = el.getAttribute('data-globe-country');
      if (code && code === highlightedCode) el.setAttribute('data-active', '');
      else el.removeAttribute('data-active');
    });
  }

  // Project a 3D unit vector using current camera basis.
  function projectVec(v, sinLat, cosLat, sinLon, cosLon, cx, cy, scale) {
    const x1 = v.x * cosLon - v.z * sinLon;
    const z1 = v.x * sinLon + v.z * cosLon;
    const y2 = v.y * cosLat - z1 * sinLat;
    const z2 = v.y * sinLat + z1 * cosLat;
    return {
      x: cx + x1 * scale,
      y: cy - y2 * scale,
      z: z2,
      r2: x1 * x1 + y2 * y2,
    };
  }

  function draw(now) {
    if (!width || !height) resize();
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const radius = Math.min(width, height) * 0.455;
    const projScale = radius * ZOOM;
    const maxR2 = 1 / (ZOOM * ZOOM);

    const latRad = camLat * DEG;
    const lonRad = camLon * DEG;
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);

    // 1. Sphere shaded disc
    const surfGrad = ctx.createRadialGradient(
      cx - radius * 0.28,
      cy - radius * 0.28,
      radius * 0.06,
      cx,
      cy,
      radius
    );
    surfGrad.addColorStop(0, palette.surfaceInner);
    surfGrad.addColorStop(1, palette.surfaceOuter);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, TAU);
    ctx.fillStyle = surfGrad;
    ctx.fill();

    // Clip everything inside the globe sphere rim
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 0.5, 0, TAU);
    ctx.clip();

    // 2. Subtle warm Ember aura under the covered European region
    const euroCenter = projectVec(
      latLonToVec3(46.0, 15.0),
      sinLat,
      cosLat,
      sinLon,
      cosLon,
      cx,
      cy,
      projScale
    );
    if (euroCenter.z > 0) {
      const aura = ctx.createRadialGradient(
        euroCenter.x,
        euroCenter.y,
        0,
        euroCenter.x,
        euroCenter.y,
        radius * 0.72
      );
      aura.addColorStop(0, palette.ambient);
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    // 3. Graticule lines
    ctx.strokeStyle = palette.graticule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < graticuleLines.length; i++) {
      const line = graticuleLines[i];
      let penDown = false;
      for (let j = 0; j < line.length; j++) {
        const p = projectVec(line[j], sinLat, cosLat, sinLon, cosLon, cx, cy, projScale);
        if (p.z > 0.05 && p.r2 <= maxR2 * 1.05) {
          if (!penDown) {
            ctx.moveTo(p.x, p.y);
            penDown = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        } else {
          penDown = false;
        }
      }
    }
    ctx.stroke();

    // 4. World land dots (batched into core & rim-fade passes for smooth horizon falloff)
    const baseDotR = Math.max(1.25, radius * 0.0068);
    ctx.fillStyle = palette.dot;

    ctx.beginPath();
    const fadeDots = [];
    for (let i = 0; i < worldPts.length; i++) {
      const p = projectVec(worldPts[i], sinLat, cosLat, sinLon, cosLon, cx, cy, projScale);
      if (p.z <= 0.1 || p.r2 > maxR2) continue;
      const rimRatio = p.r2 / maxR2;
      if (rimRatio < 0.72) {
        ctx.moveTo(p.x + baseDotR, p.y);
        ctx.arc(p.x, p.y, baseDotR, 0, TAU);
      } else {
        fadeDots.push(p);
      }
    }
    ctx.fill();

    if (fadeDots.length) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      const fadeR = baseDotR * 0.88;
      for (let i = 0; i < fadeDots.length; i++) {
        const p = fadeDots[i];
        ctx.moveTo(p.x + fadeR, p.y);
        ctx.arc(p.x, p.y, fadeR, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }

    // 5. Highlighted countries (UK, Bulgaria, Romania, Greece)
    const openId = hoveredMarkerId || pinnedMarkerId;
    const focusedCountry =
      activeCountry || (openId ? (markers.find((m) => m.id === openId) || {}).country : null);

    const hiDotR = Math.max(1.9, radius * 0.0098);
    const glowDotR = hiDotR * 2.15;
    const focusedDotR = hiDotR * 1.24;

    const visibleHi = [];
    for (let i = 0; i < highlightPts.length; i++) {
      const pt = highlightPts[i];
      const p = projectVec(pt, sinLat, cosLat, sinLon, cosLon, cx, cy, projScale);
      if (p.z > 0.08 && p.r2 <= maxR2) {
        visibleHi.push({ x: p.x, y: p.y, country: pt.country });
      }
    }

    // Soft glow pass behind all four covered countries
    ctx.fillStyle = palette.highlightGlow;
    ctx.beginPath();
    for (let i = 0; i < visibleHi.length; i++) {
      const p = visibleHi[i];
      const r = p.country === focusedCountry ? glowDotR * 1.25 : glowDotR;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, TAU);
    }
    ctx.fill();

    // Crisp Ember core pass for all four covered countries
    ctx.fillStyle = palette.highlight;
    ctx.beginPath();
    for (let i = 0; i < visibleHi.length; i++) {
      const p = visibleHi[i];
      const r = p.country === focusedCountry ? focusedDotR : hiDotR;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, TAU);
    }
    ctx.fill();

    // 6. 3D geodesic arc connecting London and Sofia headquarters
    if (arcPts.length > 1) {
      ctx.save();
      ctx.strokeStyle = palette.highlight;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      if (!reducedMotion) {
        ctx.lineDashOffset = -((now - startTime) * 0.012);
      }
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < arcPts.length; i++) {
        const t = i / (arcPts.length - 1);
        const lift = 1 + Math.sin(t * Math.PI) * 0.035;
        const p = projectVec(arcPts[i], sinLat, cosLat, sinLon, cosLon, cx, cy, projScale * lift);
        if (p.z > 0.1) {
          if (!started) {
            ctx.moveTo(p.x, p.y);
            started = true;
          } else {
            ctx.lineTo(p.x, p.y);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // end sphere clip

    // 7. Crisp outer rim border
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 0.5, 0, TAU);
    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();

    // 8. Position HTML headquarters pins and adjust tooltip alignment
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const p = projectVec(m.vec, sinLat, cosLat, sinLon, cosLon, cx, cy, projScale);
      const inDisc = p.z > 0.15 && p.r2 <= maxR2 * 0.94;
      if (inDisc) {
        m.el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
        m.el.removeAttribute('data-hidden');
        // Flip tooltip downward if pin is near the top of the globe, or inward near edges
        const placeBelow = p.y < cy - radius * 0.32;
        if (placeBelow) m.el.setAttribute('data-tooltip-pos', 'bottom');
        else m.el.removeAttribute('data-tooltip-pos');
      } else {
        m.el.setAttribute('data-hidden', '');
      }
    }
  }

  function step(now) {
    raf = 0;
    const isPaused = Boolean(isDragging || hoveredMarkerId || pinnedMarkerId || activeCountry);

    if (!isDragging) {
      if (!reducedMotion && !isPaused) {
        const elapsed = (now - startTime) * 0.001;
        targetLon = DEFAULT_LON + Math.sin(elapsed * 0.42) * 4.5;
        targetLat = DEFAULT_LAT + Math.cos(elapsed * 0.31) * 2.0;
      }
      const ease = reducedMotion ? 0.35 : 0.085;
      camLat += (targetLat - camLat) * ease;
      camLon += (targetLon - camLon) * ease;
    }

    draw(now);

    const settling =
      Math.abs(targetLat - camLat) > 0.02 || Math.abs(targetLon - camLon) > 0.02;
    if (visible && !document.hidden && (!reducedMotion || isDragging || settling)) {
      raf = requestAnimationFrame(step);
    }
  }

  function requestTick() {
    if (!raf && visible && !document.hidden) {
      raf = requestAnimationFrame(step);
    }
  }

  // Pointer drag rotation on canvas
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    isDragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartLat = camLat;
    dragStartLon = camLon;
    root.setAttribute('data-dragging', '');
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    requestTick();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    const sensitivity = 0.16;
    camLon = Math.max(-35, Math.min(60, dragStartLon - dx * sensitivity));
    camLat = Math.max(22, Math.min(68, dragStartLat + dy * sensitivity));
    targetLon = camLon;
    targetLat = camLat;
    requestTick();
  });

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    root.removeAttribute('data-dragging');
    if (!pinnedMarkerId && !activeCountry) {
      targetLat = DEFAULT_LAT;
      targetLon = DEFAULT_LON;
    }
    requestTick();
  };

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  //Clicking the globe background (without dragging) dismisses any pinned tooltip
  canvas.addEventListener('click', () => {
    if (!dragMoved && pinnedMarkerId) {
      pinnedMarkerId = null;
      targetLat = DEFAULT_LAT;
      targetLon = DEFAULT_LON;
      updateMarkerStates();
      requestTick();
    }
  });

  // Headquarters pin interactions (hover, focus, click)
  markers.forEach((m) => {
    m.el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      hoveredMarkerId = m.id;
      updateMarkerStates();
      requestTick();
    });

    m.el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      if (hoveredMarkerId === m.id) hoveredMarkerId = null;
      updateMarkerStates();
      requestTick();
    });

    if (m.pin) {
      m.pin.addEventListener('focus', () => {
        hoveredMarkerId = m.id;
        updateMarkerStates();
        requestTick();
      });

      m.pin.addEventListener('blur', () => {
        if (hoveredMarkerId === m.id) hoveredMarkerId = null;
        updateMarkerStates();
        requestTick();
      });

      m.pin.addEventListener('click', (e) => {
        e.stopPropagation();
        if (pinnedMarkerId === m.id) {
          pinnedMarkerId = null;
          hoveredMarkerId = null;
          targetLat = DEFAULT_LAT;
          targetLon = DEFAULT_LON;
        } else {
          pinnedMarkerId = m.id;
          // Smoothly bias the camera toward the selected headquarters
          targetLat = DEFAULT_LAT + (m.lat - DEFAULT_LAT) * 0.35;
          targetLon = DEFAULT_LON + (m.lon - DEFAULT_LON) * 0.35;
        }
        updateMarkerStates();
        requestTick();
      });
    }
  });

  // Country list interactions (hover, focus, click)
  countryEls.forEach((el) => {
    const code = el.getAttribute('data-globe-country');
    const cLat = parseFloat(el.getAttribute('data-lat')) || DEFAULT_LAT;
    const cLon = parseFloat(el.getAttribute('data-lon')) || DEFAULT_LON;
    const matchingMarker = markers.find((m) => m.country === code);

    const activateCountry = () => {
      activeCountry = code;
      if (matchingMarker) hoveredMarkerId = matchingMarker.id;
      targetLat = DEFAULT_LAT + (cLat - DEFAULT_LAT) * 0.42;
      targetLon = DEFAULT_LON + (cLon - DEFAULT_LON) * 0.42;
      updateMarkerStates();
      requestTick();
    };

    const deactivateCountry = () => {
      if (activeCountry === code) activeCountry = null;
      if (matchingMarker && hoveredMarkerId === matchingMarker.id) {
        hoveredMarkerId = null;
      }
      if (!pinnedMarkerId) {
        targetLat = DEFAULT_LAT;
        targetLon = DEFAULT_LON;
      }
      updateMarkerStates();
      requestTick();
    };

    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      activateCountry();
    });
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'touch') return;
      deactivateCountry();
    });
    el.addEventListener('focus', activateCountry);
    el.addEventListener('blur', deactivateCountry);
    el.addEventListener('click', () => {
      if (matchingMarker) {
        pinnedMarkerId = pinnedMarkerId === matchingMarker.id ? null : matchingMarker.id;
      }
      activateCountry();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        el.click();
      }
    });
  });

  // Dismiss pinned tooltip on outside click or Escape key
  document.addEventListener('click', (e) => {
    if (!pinnedMarkerId) return;
    if (!root.contains(e.target) && !e.target.closest('[data-globe-country]')) {
      pinnedMarkerId = null;
      targetLat = DEFAULT_LAT;
      targetLon = DEFAULT_LON;
      updateMarkerStates();
      requestTick();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (pinnedMarkerId || hoveredMarkerId)) {
      pinnedMarkerId = null;
      hoveredMarkerId = null;
      targetLat = DEFAULT_LAT;
      targetLon = DEFAULT_LON;
      updateMarkerStates();
      requestTick();
    }
  });

  // Observers and theme/motion listeners
  readPalette();
  resize();
  updateMarkerStates();
  draw(performance.now());

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      resize();
      draw(performance.now());
    }).observe(root);
  } else {
    window.addEventListener('resize', () => {
      resize();
      draw(performance.now());
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      if (visible) requestTick();
      else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }).observe(root);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) requestTick();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  document.addEventListener('themechange', () => {
    readPalette();
    draw(performance.now());
  });

  const onMotionChange = (e) => {
    reducedMotion = e.matches;
    if (reducedMotion) {
      targetLat = DEFAULT_LAT;
      targetLon = DEFAULT_LON;
      camLat = DEFAULT_LAT;
      camLon = DEFAULT_LON;
      draw(performance.now());
    } else {
      requestTick();
    }
  };
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onMotionChange);
  else if (reducedQuery.addListener) reducedQuery.addListener(onMotionChange);

  requestTick();
}
