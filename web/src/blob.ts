// The living blob: one WebGL quad, a sine-wobbled disc with fbm colour inside and fake 3D light.
// Tail paints it in the cool family, Fade in the warm one; switching eases between the two.

export type Palette = [string, string, string, string];
export const TAIL: Palette = ["#0fbf9f", "#33b4ff", "#5a63ff", "#c4f25e"];
export const FADE: Palette = ["#ff5a4e", "#ff3d8b", "#ffb03a", "#8a5cff"];

const vert = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
const frag = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse;
uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 c4;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  uv -= uMouse * 0.05;
  float t = uTime * 0.12;
  float d = length(uv);
  float ang = atan(uv.y, uv.x);
  float r = 0.33 + 0.055 * sin(2.0 * ang + t * 2.2) + 0.04 * sin(3.0 * ang - t * 1.6 + 1.3) + 0.025 * sin(5.0 * ang + t * 3.1 + 2.0);
  float inside = 1.0 - smoothstep(r - 0.004, r + 0.002, d);
  if (inside <= 0.0) { gl_FragColor = vec4(0.0); return; }
  float h = clamp(d / r, 0.0, 1.0);
  vec3 n = normalize(vec3(uv / r, sqrt(max(0.0, 1.0 - h * h)) + 0.15));
  vec2 q = uv * 2.4 + vec2(fbm(uv * 2.0 + t), fbm(uv * 2.0 - t + 3.1));
  float f = fbm(q + t * 0.6);
  vec3 col = mix(c1, c2, smoothstep(0.3, 0.68, f));
  col = mix(col, c3, smoothstep(0.45, 0.8, fbm(q * 1.3 - t)) * 0.95);
  col = mix(col, c4, smoothstep(0.62, 0.9, 1.0 - f) * 0.55);
  vec3 L = normalize(vec3(-0.45, 0.6, 0.7));
  float diff = 0.78 + 0.32 * dot(n, L);
  float spec = pow(max(0.0, dot(reflect(-L, n), vec3(0.0, 0.0, 1.0))), 22.0) * 0.32;
  col = col * diff + spec;
  col = mix(col, vec3(1.0), smoothstep(0.75, 1.0, h) * 0.18);
  gl_FragColor = vec4(col * inside, inside);
}`;

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

export interface BlobHandle {
  setPalette(p: Palette): void;
  destroy(): void;
}

export function mountBlob(host: HTMLElement, initial: Palette): BlobHandle {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
  const fallback = (): BlobHandle => {
    host.classList.add("fallback");
    return { setPalette: () => undefined, destroy: () => host.classList.remove("fallback") };
  };
  if (!gl) return fallback();

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  } catch (err) {
    console.warn(err);
    return fallback();
  }
  host.appendChild(canvas);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const keys = ["c1", "c2", "c3", "c4"] as const;

  let from = initial.map(hex);
  let to = from;
  let mixStart = 0;
  const current = () => {
    const k = Math.min(1, (performance.now() - mixStart) / 700);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    return from.map((c, i) => c.map((v, j) => v + (to[i]![j]! - v) * e));
  };

  const mouse = [0, 0];
  const target = [0, 0];
  const onMove = (e: PointerEvent) => {
    target[0] = e.clientX / innerWidth - 0.5;
    target[1] = 0.5 - e.clientY / innerHeight;
  };
  addEventListener("pointermove", onMove, { passive: true });

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visible = true;
  let alive = true;
  let dirty = true;
  const io = new IntersectionObserver(([e]) => (visible = !!e?.isIntersecting));
  io.observe(host);
  const start = performance.now();

  function frame(now: number) {
    if (!alive) return;
    if (visible && !document.hidden && (!still || dirty)) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl!.viewport(0, 0, w, h);
      }
      mouse[0]! += (target[0]! - mouse[0]!) * 0.05;
      mouse[1]! += (target[1]! - mouse[1]!) * 0.05;
      current().forEach((c, i) => gl!.uniform3fv(u(keys[i]!), c));
      gl!.uniform2f(u("uRes"), canvas.width, canvas.height);
      gl!.uniform1f(u("uTime"), still ? 8 : (now - start) / 1000);
      gl!.uniform2f(u("uMouse"), still ? 0 : mouse[0]!, still ? 0 : mouse[1]!);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      if (still && performance.now() - mixStart > 750) dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setPalette(p) {
      from = current();
      to = p.map(hex);
      mixStart = performance.now();
      dirty = true;
    },
    destroy() {
      alive = false;
      io.disconnect();
      removeEventListener("pointermove", onMove);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
