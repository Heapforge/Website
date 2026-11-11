/**
 * Hero "heat field": a hand-written WebGL fragment shader.
 *
 * Domain-warped fBm (fbm(p + fbm(p + fbm(p)))) drifts upward like convection
 * above a forge. The warped value drives a four-stop colour ramp read from the
 * CSS custom properties --heat-0…--heat-3, weighted by a "forge mouth" glow at
 * the bottom right so the type side of the hero stays calm. A dozen embers
 * rise out of the mouth, sway, flicker and burn out. Film grain is a CSS
 * overlay (.grain) so it stays pixel-sharp while the field renders at reduced
 * resolution and is upscaled.
 *
 * Budget: 4-octave value noise × 5 fBm calls + 12 ember taps per pixel, at
 * half resolution (DPR capped at 1.5), throttled to 30 fps, paused off-screen
 * and in hidden tabs. Reduced motion renders one still frame. Without WebGL
 * the hero's CSS gradient remains.
 *
 * The logo symbols ([data-heat-logo]) run a smaller variant: the same noise,
 * rising faster, drawn on a canvas masked to the flame paths (see logo.html).
 * It ramps glow -> core from its own --heat-logo-* tokens, which are
 * theme-independent, so the flame looks the same in light and dark. In dark
 * mode a second canvas, cut to the white ink ([data-heat-logo-ink]), runs the
 * same field on the same clock, so the ink catches the flame's light.
 */

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const NOISE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = ROT * p;
    a *= 0.5;
  }
  return v / 0.9375;
}
`;

const FRAGMENT = NOISE + `
uniform vec2 uRes;       // drawing-buffer size in pixels
uniform float uScale;    // buffer pixels per CSS pixel
uniform float uTime;     // seconds
uniform vec3 uC0;        // cold ground
uniform vec3 uC1;        // haze (navy in dark, cool grey in light)
uniform vec3 uC2;        // glow
uniform vec3 uC3;        // hottest core
uniform vec3 uEmber;     // ember colour
uniform float uStrength; // overall heat
uniform float uAmbient;  // baseline heat across wide rows (0 in hero)

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;            // 0..1, origin bottom-left
  float aspect = uAmbient > 0.0 ? min(uRes.x / uRes.y, 1.8) : uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.0;
  float t = uTime;

  // Domain warp, everything drifting upward (sampling lower = rising).
  vec2 rise = vec2(0.0, -t * 0.05);
  vec2 q = vec2(fbm(p + rise), fbm(p + vec2(5.2, 1.3) + rise * 1.4));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + vec2(t * 0.015, -t * 0.08)),
                fbm(p + 3.0 * q + vec2(8.3, 2.8) + vec2(-t * 0.01, -t * 0.065)));
  float f = fbm(p + 2.4 * r + rise * 1.8);

  // The forge mouth: heat pools at the bottom right and fans upward.
  vec2 m = vec2((uv.x - 0.93) * aspect * 0.62, (uv.y + 0.12) * 0.95);
  float mouth = exp(-dot(m, m) * 2.8);
  float floorGlow = (1.0 - smoothstep(0.0, 0.4, uv.y)) * smoothstep(0.45, 1.0, uv.x) * 0.3;
  float zone = clamp(mouth + floorGlow + uAmbient, 0.0, 1.0);

  float heat = (f * f * 1.6 + length(r) * 0.22) * (0.16 + 1.1 * zone) + zone * 0.3;
  heat *= uStrength;

  // Colour ramp: ground -> haze (everywhere, softly) -> glow -> core.
  vec3 col = mix(uC0, uC1, smoothstep(0.25, 0.85, f) * (0.55 + 0.45 * zone));
  col = mix(col, uC2, smoothstep(0.42, 0.95, heat));
  col = mix(col, uC3, smoothstep(0.85, 1.35, heat));

  // Embers rising from the mouth.
  vec2 px = gl_FragCoord.xy / uScale;            // CSS pixels
  vec2 cssRes = uRes / uScale;
  float emberScale = 1.0 + uAmbient * 2.0;
  float glow = 0.0;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float s1 = hash(vec2(fi, 1.7));
    float s2 = hash(vec2(fi, 9.1));
    float s3 = hash(vec2(fi, 4.3));
    float life = fract(s1 + t * (0.018 + s2 * 0.03));
    float x = (0.55 - uAmbient * 0.45) + s3 * (0.43 + uAmbient * 0.42)
            + sin(t * (0.35 + s1 * 0.5) + fi * 2.1) * 0.018
            + (s2 - 0.5) * life * 0.16;
    float y = -0.04 + life * 0.95;
    vec2 d = px - vec2(x, y) * cssRes;
    float rad = (0.9 + s2 * 1.4) * emberScale;
    float d2 = dot(d, d);
    float core = exp(-d2 / (rad * rad));
    float halo = exp(-d2 / (rad * rad * 18.0)) * (0.22 * emberScale);
    float fade = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.45, 0.9, life));
    float flicker = 0.65 + 0.35 * sin(t * (5.0 + s3 * 6.0) + fi * 3.7);
    glow += (core + halo) * fade * flicker;
  }
  col = mix(col, uEmber, clamp(glow * uStrength, 0.0, 1.0));

  // Ordered dither against banding in the long gradients.
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

// The logo's heat field, shared by the flame and the ink so they move as one:
// the hero's warp, rising faster so it reads as flame at this size, hottest
// at the base.
const LOGO_FIELD = NOISE + `
uniform vec2 uRes;
uniform float uTime;
uniform float uStrength;

float logoHeat(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * 2.2;
  vec2 rise = vec2(0.0, -uTime * 0.35);
  vec2 q = vec2(fbm(p + rise), fbm(p + vec2(5.2, 1.3) + rise * 1.3));
  float f = fbm(p + 2.2 * q + rise * 1.6);
  return (f * f * 2.2 + (1.0 - uv.y) * 0.45 - 0.2) * uStrength;
}
`;

const FLAME_FRAGMENT = LOGO_FIELD + `
uniform vec3 uC2;        // glow
uniform vec3 uC3;        // hottest core

void main() {
  float heat = logoHeat(gl_FragCoord.xy / uRes);
  // Glow -> core, so the flame stays an ember.
  gl_FragColor = vec4(mix(uC2, uC3, smoothstep(0.15, 0.85, heat)), 1.0);
}
`;

const INK_FRAGMENT = LOGO_FIELD + `
uniform vec3 uC0;        // ink
uniform vec3 uC2;        // glow
uniform float uAmount;   // how much firelight the ink catches

void main() {
  float heat = logoHeat(gl_FragCoord.xy / uRes);
  // A faint warm frost everywhere, washed peach where the flame runs hot.
  float light = 0.18 + 0.82 * smoothstep(0.1, 1.0, heat);
  gl_FragColor = vec4(mix(uC0, uC2, light * uAmount), 1.0);
}
`;

const STILL_TIME = 37.0;   // a pleasing frame for reduced motion
// renderScale: fraction of device pixels rendered, then upscaled.
// colors / floats: which CSS custom properties feed which uniforms.
// clock: fields sharing one stay in step (the flame and its ink).
const HERO_CLOCK = { t: 12, stamp: 0 };
const HERO = {
  renderScale: 0.5, maxDpr: 1.5, clock: HERO_CLOCK,
  colors: { uC0: '--heat-0', uC1: '--heat-1', uC2: '--heat-2', uC3: '--heat-3', uEmber: '--heat-ember' },
  floats: { uStrength: '--heat-strength', uAmbient: '--heat-ambient' },
};
const ROW = {
  ...HERO,
  hover: true,
  colors: { uC0: '--heat-0', uC1: '--heat-1', uC2: '--heat-row-2', uC3: '--heat-row-3', uEmber: '--heat-row-ember' },
  floats: { uStrength: '--heat-row-strength', uAmbient: '--heat-row-ambient' },
};
const LOGO_CLOCK = { t: 12, stamp: 0 };
const FLAME = {                                   // a few hundred pixels: render it sharp
  renderScale: 1, maxDpr: 2, clock: LOGO_CLOCK,
  colors: { uC2: '--heat-logo-glow', uC3: '--heat-logo-core' },
  floats: { uStrength: '--heat-logo-strength' },
};
const INK = {
  ...FLAME,                                       // same size and clock: the same field as the flame
  colors: { uC0: '--logo-ink', uC2: '--heat-logo-glow' },
  floats: { uStrength: '--heat-logo-strength', uAmount: '--heat-logo-ink-glow' },
};
const FRAME_MS = 1000 / 30;

function parseColor(value) {
  const v = value.trim();
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255];
  return null;
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createGlProgram(gl, fragment, colors, floats) {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['uRes', 'uScale', 'uTime', 'uC0', 'uC1', 'uC2', 'uC3', 'uEmber', 'uStrength', 'uAmbient', 'uAmount']
    .forEach((name) => { u[name] = gl.getUniformLocation(program, name); });

  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const [uniform, prop] of Object.entries(colors)) {
      const rgb = parseColor(cs.getPropertyValue(prop));
      if (rgb) gl.uniform3fv(u[uniform], rgb);
    }
    for (const [uniform, prop] of Object.entries(floats)) {
      const value = parseFloat(cs.getPropertyValue(prop));
      gl.uniform1f(u[uniform], Number.isFinite(value) ? value : 1);
    }
  };

  return { u, readColors };
}

// Shared offscreen WebGL renderer for hover rows so all rows across the page
// share one WebGL context and copy frames into lightweight 2D canvases.
function createSharedRenderer(fragment, { colors, floats }) {
  const surface = document.createElement('canvas');
  let gl = null;
  try {
    gl = surface.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, powerPreference: 'low-power',
    });
  } catch (e) {
    gl = null;
  }
  if (!gl) return null;

  const prog = createGlProgram(gl, fragment, colors, floats);
  if (!prog) return null;
  const { u, readColors } = prog;

  return {
    readColors,
    drawTo(ctx, w, h, scale, time) {
      if (surface.width < w) surface.width = w;
      if (surface.height < h) surface.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uScale, scale);
      gl.uniform1f(u.uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      ctx.drawImage(surface, 0, surface.height - h, w, h, 0, 0, w, h);
    },
  };
}

function runField(canvas, fragment, { renderScale, maxDpr, colors, floats, clock: shared, hover = false, phase = 0, renderer = null }) {
  let gl = null;
  let u = null;
  let readColors = null;
  let ctx2d = null;

  if (renderer) {
    ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    readColors = renderer.readColors;
  } else {
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: false, powerPreference: 'low-power',
      });
    } catch (e) {
      gl = null;
    }
    if (!gl) return; // the CSS gradient (or SVG flame) fallback stays visible.

    const prog = createGlProgram(gl, fragment, colors, floats);
    if (!prog) return;
    u = prog.u;
    readColors = prog.readColors;
  }

  let w = 1;
  let h = 1;
  let scale = 1;

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    scale = dpr * renderScale;
    w = Math.max(1, Math.round(canvas.clientWidth * scale));
    h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (gl) {
      gl.viewport(0, 0, w, h);
      gl.uniform2f(u.uRes, w, h);
      gl.uniform1f(u.uScale, scale);
    }
  };

  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  let visible = true;
  const hoverEl = hover ? (canvas.closest('[data-heat-hover]') || canvas.parentElement) : null;
  let pointerIn = hoverEl ? hoverEl.matches(':hover') : false;
  let focusIn = false;
  let attrActive = hoverEl ? hoverEl.hasAttribute('data-active') : false;
  let hovered = hoverEl ? (pointerIn || focusIn || attrActive) : true;
  let hoverTimer = 0;
  // Start mid-flow so the first frame is already developed.
  const clock = shared || { t: 12, stamp: 0 };
  let last = 0;
  let raf = 0;

  // Advance the clock once per animation frame, however many fields share it.
  const advance = (now) => {
    if (now === clock.stamp) return;
    clock.t += clock.stamp ? Math.min((now - clock.stamp) / 1000, 0.1) : 0;
    clock.stamp = now;
  };

  const draw = (time) => {
    if (renderer) {
      renderer.drawTo(ctx2d, w, h, scale, time + phase);
    } else {
      gl.uniform1f(u.uTime, time + phase);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!canvas.hasAttribute('data-ready')) canvas.setAttribute('data-ready', '');
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (last && now - last < FRAME_MS) return;
    last = now;
    advance(now);
    draw(clock.t);
  };

  const shouldRun = () => !reduced && visible && hovered && !document.hidden;

  const sync = () => {
    if (shouldRun()) {
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (reduced) draw(STILL_TIME);
    }
  };

  const redrawIfIdle = () => { if (!raf) draw(reduced ? STILL_TIME : clock.t); };

  readColors();
  resize();
  draw(reduced ? STILL_TIME : clock.t);

  if (hoverEl) {
    const updateHover = () => {
      clearTimeout(hoverTimer);
      if (pointerIn || focusIn || attrActive) {
        hovered = true;
        sync();
      } else {
        hoverTimer = setTimeout(() => {
          hovered = false;
          sync();
        }, 500);
      }
    };
    hoverEl.addEventListener('pointerenter', () => { pointerIn = true; updateHover(); });
    hoverEl.addEventListener('pointerleave', () => { pointerIn = false; updateHover(); });
    hoverEl.addEventListener('focusin', () => { focusIn = true; updateHover(); });
    hoverEl.addEventListener('focusout', () => { focusIn = false; updateHover(); });
    if ('MutationObserver' in window) {
      new MutationObserver(() => {
        attrActive = hoverEl.hasAttribute('data-active');
        updateHover();
      }).observe(hoverEl, { attributes: true, attributeFilter: ['data-active'] });
    }
  }

  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { resize(); redrawIfIdle(); }).observe(canvas);
  } else {
    window.addEventListener('resize', () => { resize(); redrawIfIdle(); });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      sync();
    }).observe(canvas);
  }

  document.addEventListener('visibilitychange', sync);
  document.addEventListener('themechange', () => { readColors(); redrawIfIdle(); });

  const onMotionChange = (e) => { reduced = e.matches; sync(); };
  if (reducedQuery.addEventListener) reducedQuery.addEventListener('change', onMotionChange);
  else if (reducedQuery.addListener) reducedQuery.addListener(onMotionChange);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    canvas.removeAttribute('data-ready'); // fall back to the CSS gradient / SVG flame
  });

  sync();
}

export function initHeatField() {
  const hero = document.querySelector('[data-heat]');
  if (hero) runField(hero, FRAGMENT, HERO);
  const rows = document.querySelectorAll('[data-heat-row]');
  if (rows.length) {
    const rowRenderer = createSharedRenderer(FRAGMENT, ROW);
    if (rowRenderer) {
      rows.forEach((canvas, i) => {
        runField(canvas, FRAGMENT, { ...ROW, phase: (i + 1) * 9.7, renderer: rowRenderer });
      });
    }
  }
  document.querySelectorAll('[data-heat-logo]').forEach((canvas) => runField(canvas, FLAME_FRAGMENT, FLAME));
  document.querySelectorAll('[data-heat-logo-ink]').forEach((canvas) => runField(canvas, INK_FRAGMENT, INK));
}
