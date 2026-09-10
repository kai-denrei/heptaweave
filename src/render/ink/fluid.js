// fluid.js — WebGL dye-in-water engine for the ink theme.
//
// Own implementation of the classic pipeline: a ping-pong RGBA dye texture,
// curl-noise advection with per-step dissipation, additive gaussian splats,
// bright-pass bloom, and a display pass that maps (core, density) through a
// palette LUT with caustics, vignette, tonemap and grain.
//
// uv convention: u ∈ [0,1] left→right, v ∈ [0,1] bottom→top (GL). Use
// `uvFromClient(x, y)` to convert pointer/DOM coordinates.
//
// No DOM beyond the canvas it is given. No rules. See ../../params.js for
// the knobs that feed `step()` and `render()`.

import { VERT, FRAG_ADVECT, FRAG_SPLAT, FRAG_STAMP, FRAG_DIFFUSE, FRAG_WAVE, FRAG_DISTURB, FRAG_PREFILTER, FRAG_BLUR, FRAG_DISPLAY } from './shaders.js';
import { PALETTES, buildLut, paletteAt } from './palettes.js';

const GL_OPTS = {
  alpha: false, antialias: false, depth: false, stencil: false,
  preserveDrawingBuffer: false, premultipliedAlpha: false,
};

export function createFluid(canvas, { simScale = 0.5, maxDpr = 2 } = {}) {
  const gl = canvas.getContext('webgl', GL_OPTS) || canvas.getContext('experimental-webgl', GL_OPTS);
  if (!gl) return { ok: false, reason: 'no-webgl' };

  // --------------------------------------------------------------------------
  // GL helpers
  // --------------------------------------------------------------------------
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // Texture type: half-float → float → byte, verifying each is renderable
  // (having the extension does not guarantee colour-renderability).
  let texType = gl.UNSIGNED_BYTE;
  let linear = true;
  function renderable(type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    return ok;
  }
  {
    const hf = gl.getExtension('OES_texture_half_float');
    const f = gl.getExtension('OES_texture_float');
    const candidates = [];
    if (hf) candidates.push({ type: hf.HALF_FLOAT_OES, lin: !!gl.getExtension('OES_texture_half_float_linear') });
    if (f)  candidates.push({ type: gl.FLOAT, lin: !!gl.getExtension('OES_texture_float_linear') });
    candidates.push({ type: gl.UNSIGNED_BYTE, lin: true });
    for (const c of candidates) {
      if (renderable(c.type)) { texType = c.type; linear = c.lin; break; }
    }
  }

  function makeTarget(w, h) {
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, texType, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    // Alpha is density — must clear to 0 or the stage boots fully inked.
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h };
  }
  function freeTarget(t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }
  function makePingPong(w, h) {
    let a = makeTarget(w, h), b = makeTarget(w, h);
    return {
      get read() { return a; },
      get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      clear() {
        for (const t of [a, b]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      },
      free() { freeTarget(a); freeTarget(b); },
      w, h,
    };
  }

  // --------------------------------------------------------------------------
  // Programs, quad, LUT
  // --------------------------------------------------------------------------
  const progAdvect = program(FRAG_ADVECT);
  const progSplat = program(FRAG_SPLAT);
  const progDiffuse = program(FRAG_DIFFUSE);
  const progStamp = program(FRAG_STAMP);
  const progWave = program(FRAG_WAVE);
  const progDisturb = program(FRAG_DISTURB);
  const progPre = program(FRAG_PREFILTER);
  const progBlur = program(FRAG_BLUR);
  const progDisplay = program(FRAG_DISPLAY);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  function drawQuad() {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  const lutTex = gl.createTexture();
  let paletteIndex = -1;
  let lut = null;
  function setPalette(i) {
    const idx = Math.max(0, Math.min(PALETTES.length - 1, i | 0));
    if (idx === paletteIndex) return;
    paletteIndex = idx;
    lut = buildLut(paletteAt(idx).stops);
    const data = new Uint8Array(256 * 4);
    for (let k = 0; k < 256; k++) {
      data[k * 4] = lut[k * 3] * 255;
      data[k * 4 + 1] = lut[k * 3 + 1] * 255;
      data[k * 4 + 2] = lut[k * 3 + 2] * 255;
      data[k * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  setPalette(0);

  // --------------------------------------------------------------------------
  // Targets
  // --------------------------------------------------------------------------
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  let DW = 0, DH = 0, SW = 0, SH = 0;
  let dye = null, pre = null, bloomA = null, bloomB = null;
  let height = null;   // water surface ping-pong (lab), allocated on first use
  let HW = 0, HH = 0;
  let scale = simScale;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const w = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    canvas.width = w; canvas.height = h;
    DW = w; DH = h;
    if (dye) dye.free();
    if (height) { height.free(); height = null; }
    freeTarget(pre); freeTarget(bloomA); freeTarget(bloomB);
    SW = Math.max(160, Math.floor(w * scale));
    SH = Math.max(120, Math.floor(h * scale));
    dye = makePingPong(SW, SH);
    const bw = Math.max(80, Math.floor(SW / 2)), bh = Math.max(60, Math.floor(SH / 2));
    pre = makeTarget(bw, bh);
    bloomA = makeTarget(bw, bh);
    bloomB = makeTarget(bw, bh);
  }
  resize();

  function setSimScale(s) {
    const v = Math.max(0.2, Math.min(1, s));
    if (Math.abs(v - scale) < 1e-3) return;
    scale = v;
    resize();
  }

  // --------------------------------------------------------------------------
  // Passes
  // --------------------------------------------------------------------------
  let simTime = 0;

  function advect(dt, cfg) {
    gl.disable(gl.BLEND);
    gl.useProgram(progAdvect.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.viewport(0, 0, SW, SH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progAdvect.u.u_dye, 0);
    gl.uniform2f(progAdvect.u.u_texel, 1 / SW, 1 / SH);
    gl.uniform1f(progAdvect.u.u_time, simTime);
    gl.uniform1f(progAdvect.u.u_dt, dt);
    gl.uniform1f(progAdvect.u.u_dissip, cfg.dissip ?? 1);
    gl.uniform1f(progAdvect.u.u_flowScale, cfg.flowScale ?? 2.4);
    gl.uniform1f(progAdvect.u.u_flowStr, cfg.flowStr ?? 1.4);
    gl.uniform1f(progAdvect.u.u_aspect, SW / SH);
    gl.uniform1f(progAdvect.u.u_eps, cfg.curlE ?? 0.6);
    gl.uniform1f(progAdvect.u.u_octaves, cfg.octaves ?? 3);
    gl.uniform1f(progAdvect.u.u_current, cfg.current ?? 300);
    drawQuad();
    dye.swap();
  }

  function diffuse(cfg) {
    const amount = cfg.diffuse ?? 0;
    if (!(amount > 0)) return;
    gl.disable(gl.BLEND);
    gl.useProgram(progDiffuse.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.viewport(0, 0, SW, SH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progDiffuse.u.u_dye, 0);
    gl.uniform2f(progDiffuse.u.u_texel, 1 / SW, 1 / SH);
    gl.uniform1f(progDiffuse.u.u_spread, cfg.diffuseSpread ?? 1.5);
    gl.uniform1f(progDiffuse.u.u_amount, Math.min(1, amount));
    drawQuad();
    dye.swap();
  }

  // ---- water surface (lab) ------------------------------------------------
  function ensureHeight() {
    if (height) return;
    HW = Math.max(80, Math.floor(SW / 2)); HH = Math.max(60, Math.floor(SH / 2));
    height = makePingPong(HW, HH);
  }
  function wave(cfg) {
    ensureHeight();
    gl.disable(gl.BLEND);
    gl.useProgram(progWave.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, height.write.fbo);
    gl.viewport(0, 0, HW, HH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.read.tex);
    gl.uniform1i(progWave.u.u_h, 0);
    gl.uniform2f(progWave.u.u_texel, 1 / HW, 1 / HH);
    gl.uniform1f(progWave.u.u_damp, cfg.rippleDamp ?? 0.986);
    drawQuad();
    height.swap();
  }
  /** Poke the surface: a gaussian bump of `amount` at uv, radius in uv. */
  function disturb(u, v, radius, amount) {
    ensureHeight();
    gl.disable(gl.BLEND);
    gl.useProgram(progDisturb.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, height.write.fbo);
    gl.viewport(0, 0, HW, HH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, height.read.tex);
    gl.uniform1i(progDisturb.u.u_h, 0);
    gl.uniform2f(progDisturb.u.u_point, u, v);
    gl.uniform1f(progDisturb.u.u_aspect, HW / HH);
    gl.uniform1f(progDisturb.u.u_radius, radius);
    gl.uniform1f(progDisturb.u.u_amount, amount);
    drawQuad();
    height.swap();
  }

  /** One fixed simulation step. `dt` in seconds. */
  function step(dt, cfg) {
    simTime += dt * 0.9;
    advect(dt, cfg);
    diffuse(cfg);
    if (cfg.surface) wave(cfg);
  }

  // Mask texture for `stamp()`; re-uploaded per call.
  const maskTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  /**
   * Add a rasterised shape (a canvas/image whose alpha is the mask) into the
   * dye in one pass. `rect` is { u, v, w, h } in uv with v bottom-up — see
   * `rectFromClient`.
   */
  let maskLast = { source: null, version: -1 };
  function stamp(source, rect, rgb, amount, { erase = false, target = 0, version = 0 } = {}) {
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    // Re-upload only when the mask changed: a static erase mask is stamped
    // every frame for a second, a wedge slice changes every frame.
    if (maskLast.source !== source || maskLast.version !== version) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      maskLast = { source, version };
    }
    gl.disable(gl.BLEND);
    gl.useProgram(progStamp.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.viewport(0, 0, SW, SH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progStamp.u.u_dye, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.uniform1i(progStamp.u.u_mask, 1);
    gl.uniform4f(progStamp.u.u_rect, rect.u, rect.v, rect.w, rect.h);
    gl.uniform3f(progStamp.u.u_color, rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(progStamp.u.u_amount, amount);
    gl.uniform1f(progStamp.u.u_erase, erase ? 1 : 0);
    gl.uniform1f(progStamp.u.u_target, target);
    drawQuad();
    dye.swap();
  }

  /** Extra dissipation pass (wrong answer, run end, clear). */
  function drain(dissip, cfg = {}) {
    advect(1 / 60, { ...cfg, dissip, flowStr: cfg.flowStr ?? 1.4 });
  }

  function splat(u, v, rgb, radius, amount) {
    gl.disable(gl.BLEND);
    gl.useProgram(progSplat.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.write.fbo);
    gl.viewport(0, 0, SW, SH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progSplat.u.u_dye, 0);
    gl.uniform2f(progSplat.u.u_point, u, v);
    gl.uniform1f(progSplat.u.u_aspect, SW / SH);
    gl.uniform1f(progSplat.u.u_radius, radius);
    gl.uniform3f(progSplat.u.u_color, rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(progSplat.u.u_amount, amount);
    drawQuad();
    dye.swap();
  }

  function render(cfg) {
    // Bloom: bright pass → H → V → wider H → wider V.
    gl.disable(gl.BLEND);
    gl.useProgram(progPre.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pre.fbo);
    gl.viewport(0, 0, pre.w, pre.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progPre.u.u_dye, 0);
    gl.uniform1f(progPre.u.u_thresh, cfg.bloomThreshold ?? 0.18);
    drawQuad();

    gl.useProgram(progBlur.p);
    gl.uniform1i(progBlur.u.u_tex, 0);
    gl.uniform2f(progBlur.u.u_texel, 1 / bloomA.w, 1 / bloomA.h);
    const blurPass = (src, dst, dx, dy) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(progBlur.u.u_dir, dx, dy);
      drawQuad();
    };
    blurPass(pre, bloomA, 1, 0);
    blurPass(bloomA, bloomB, 0, 1);
    blurPass(bloomB, bloomA, 2, 0);
    blurPass(bloomA, bloomB, 0, 2);

    // Display.
    gl.useProgram(progDisplay.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, DW, DH);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.uniform1i(progDisplay.u.u_dye, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
    gl.uniform1i(progDisplay.u.u_bloom, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.uniform1i(progDisplay.u.u_lut, 2);
    gl.uniform2f(progDisplay.u.u_texel, 1 / DW, 1 / DH);
    gl.uniform2f(progDisplay.u.u_dtexel, 1 / SW, 1 / SH);
    gl.uniform1f(progDisplay.u.u_time, simTime * 0.5);
    gl.uniform1f(progDisplay.u.u_grain, cfg.grain ?? 0.05);
    gl.uniform1f(progDisplay.u.u_caustic, cfg.caustic ?? 7);
    gl.uniform1f(progDisplay.u.u_bloomGain, cfg.bloomGain ?? 0.6);
    gl.uniform1f(progDisplay.u.u_bloomMix, cfg.bloomMix ?? 1.2);
    gl.uniform1f(progDisplay.u.u_vig, cfg.vignette ?? 1.15);
    gl.uniform1f(progDisplay.u.u_light, cfg.light ?? 1);
    gl.uniform3f(progDisplay.u.u_core, lut[0], lut[1], lut[2]);
    // Surface + inversion (lab). Without a height field the refraction is
    // driven by the (flat) dye texture at zero strength.
    const hasSurface = !!(cfg.surface && height);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, hasSurface ? height.read.tex : dye.read.tex);
    gl.uniform1i(progDisplay.u.u_height, 3);
    gl.uniform2f(progDisplay.u.u_htexel, hasSurface ? 1 / HW : 1 / SW, hasSurface ? 1 / HH : 1 / SH);
    gl.uniform1f(progDisplay.u.u_refract, hasSurface ? (cfg.refract ?? 1) : 0);
    gl.uniform1f(progDisplay.u.u_invert, cfg.invert ? 1 : 0);
    drawQuad();
  }

  // --------------------------------------------------------------------------
  // Coordinates
  // --------------------------------------------------------------------------
  function uvFromClient(x, y) {
    const r = canvas.getBoundingClientRect();
    return {
      u: (x - r.left) / (r.width || 1),
      v: 1 - (y - r.top) / (r.height || 1),
    };
  }

  /** A client-space rect (CSS px) as a uv rect with v bottom-up. */
  function rectFromClient(x, y, w, h) {
    const r = canvas.getBoundingClientRect();
    const W = r.width || 1, H = r.height || 1;
    return { u: (x - r.left) / W, v: 1 - (y + h - r.top) / H, w: w / W, h: h / H };
  }

  function canvasHeightCss() {
    return canvas.getBoundingClientRect().height || canvas.clientHeight || 1;
  }

  return {
    ok: true,
    gl,
    canvasHeightCss,
    get texType() { return texType; },
    get simSize() { return { w: SW, h: SH }; },
    get aspect() { return SW / SH; },
    get lut() { return lut; },
    get paletteIndex() { return paletteIndex; },
    resize,
    setSimScale,
    setPalette,
    step,
    drain,
    splat,
    stamp,
    rectFromClient,
    disturb,
    render,
    clear() { dye.clear(); },
    uvFromClient,
    destroy() {
      if (dye) dye.free();
      if (height) height.free();
      freeTarget(pre); freeTarget(bloomA); freeTarget(bloomB);
      gl.deleteTexture(lutTex);
      gl.deleteTexture(maskTex);
      gl.deleteBuffer(quad);
      for (const p of [progAdvect, progSplat, progStamp, progDiffuse, progWave, progDisturb, progPre, progBlur, progDisplay]) gl.deleteProgram(p.p);
    },
  };
}
