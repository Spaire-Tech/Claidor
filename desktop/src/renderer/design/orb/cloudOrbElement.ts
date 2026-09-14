import { ORB_FRAGMENT_SHADER, ORB_VERTEX_SHADER } from './shaders';

/**
 * `<cloud-orb>` — the agent's face.
 *
 * The shaders are the canvas's, verbatim. This host is not: the canvas
 * ran four orbs on one screen and could afford to be simple, and an app
 * with a sidebar of agents cannot. Six things are different, each for a
 * reason that would otherwise be found by opening the app.
 *
 * **A context budget.** Browsers cap live WebGL contexts — Chrome at
 * around sixteen — and silently drop the oldest when a new one is asked
 * for. Sixteen agents in a sidebar plus a thread header plus a panel is
 * already past it, and past it the app starts losing orbs at random.
 * So contexts are counted and handed out largest-first; an orb that
 * cannot have one draws the gradient instead, which at 28px nobody can
 * tell from the real thing.
 *
 * **Stopping when unseen.** The canvas's loop runs forever. Here it stops
 * when the orb scrolls out of view and when the window is hidden, which
 * is most of the time for most orbs.
 *
 * **Giving the context back.** The canvas cancelled its frame on
 * disconnect and kept the context. Agents come and go, so this releases
 * it.
 *
 * **Surviving a context loss.** A GPU reset killed the canvas's orb for
 * good. This rebuilds.
 *
 * **No layout read per frame.** The canvas measured itself every frame,
 * per orb. The size comes from the ResizeObserver that is already
 * watching.
 *
 * **Reduced motion.** One frame, then still.
 */

const ATTRIBUTES = ['colors', 'grain', 'seed'] as const;

/**
 * How many live contexts to allow. Chrome's own cap is about sixteen and
 * it evicts silently past that, so this sits below it and leaves room for
 * the agent browser, which wants one too.
 */
const CONTEXT_BUDGET = 10;

/**
 * Below this, an orb is decorative: the cloud drift is invisible and the
 * motion a person sees is the CSS scale pulse on the wrapper, not the
 * shader. Small orbs therefore never take a context while a larger one
 * might want it.
 */
const LIVE_MIN_PX = 56;

const live = new Set<CloudOrbElement>();

const hexToRgb = (hex: string): [number, number, number] => {
  const raw = (hex || '').trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw;
  const n = Number.parseInt(full || 'ffffff', 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class CloudOrbElement extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return ATTRIBUTES;
  }

  private built = false;
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private frame: number | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private viewObserver: IntersectionObserver | null = null;
  private visible = true;
  private width = 0;
  private height = 0;
  private startedAt = 0;

  private colors = new Float32Array(18);
  private colorCount = 5;
  private grain = 0.08;
  private seed = 0;

  connectedCallback(): void {
    if (this.built) return;
    this.built = true;

    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>:host{display:block;border-radius:50%;overflow:hidden}'
      + 'canvas{display:block;width:100%;height:100%}</style><canvas></canvas>';
    this.canvas = root.querySelector('canvas');

    this.readAttributes();
    this.watch();
    this.start();
  }

  disconnectedCallback(): void {
    this.stop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.viewObserver?.disconnect();
    this.viewObserver = null;
    this.release();
    this.built = false;
  }

  attributeChangedCallback(): void {
    if (!this.built) return;
    this.readAttributes();
    // A palette change on a still orb must still be seen.
    if (this.frame === null) this.draw(performance.now());
  }

  // --- attributes ---------------------------------------------------------

  private readAttributes(): void {
    const raw = (this.getAttribute('colors') || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    const list = raw.length ? raw : ['#9fd86a', '#6fb8e8', '#f0a35c', '#b9a6e8', '#ffffff'];

    this.colorCount = list.length;
    this.colors = new Float32Array(18);
    list.forEach((hex, i) => {
      const [r, g, b] = hexToRgb(hex);
      this.colors[i * 3] = r;
      this.colors[i * 3 + 1] = g;
      this.colors[i * 3 + 2] = b;
    });

    this.grain = Number.parseFloat(this.getAttribute('grain') || '0.08');
    this.seed = Number.parseFloat(this.getAttribute('seed') || '0');
    this.style.setProperty('--orb-fallback-from', list[0]);
    this.style.setProperty('--orb-fallback-to', list[list.length - 1]);
  }

  // --- the still fallback -------------------------------------------------

  /**
   * What an orb looks like without a context: the same two colours as a
   * radial gradient. Used when the budget is spent, when the orb is too
   * small to be worth one, and when WebGL is unavailable at all.
   */
  private paintFallback(): void {
    const from = this.style.getPropertyValue('--orb-fallback-from') || '#9fd86a';
    const to = this.style.getPropertyValue('--orb-fallback-to') || '#ffffff';
    this.style.background = `radial-gradient(circle at 35% 30%, ${to}, ${from})`;
  }

  private clearFallback(): void {
    this.style.background = '';
  }

  // --- lifecycle ----------------------------------------------------------

  private watch(): void {
    this.resizeObserver = new ResizeObserver(entries => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box) return;
      this.width = box.width;
      this.height = box.height;
      this.resizeCanvas();
    });
    this.resizeObserver.observe(this);

    const rect = this.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;

    if (typeof IntersectionObserver === 'function') {
      this.viewObserver = new IntersectionObserver(entries => {
        const seen = entries[entries.length - 1]?.isIntersecting ?? true;
        if (seen === this.visible) return;
        this.visible = seen;
        if (seen) this.start();
        else this.stop();
      });
      this.viewObserver.observe(this);
    }
  }

  /** Whether this orb should hold one of the budgeted contexts. */
  private wantsContext(): boolean {
    const size = Math.max(this.width, this.height, this.clientWidth, this.clientHeight);
    if (size && size < LIVE_MIN_PX) return false;
    return live.has(this) || live.size < CONTEXT_BUDGET;
  }

  private start(): void {
    if (!this.isConnected || !this.visible || this.frame !== null) return;

    if (!this.gl) {
      if (!this.wantsContext() || !this.createContext()) {
        this.paintFallback();
        return;
      }
      this.clearFallback();
    }

    this.startedAt = performance.now();
    if (prefersReducedMotion()) {
      this.draw(this.startedAt);
      return;
    }
    const tick = (now: number): void => {
      this.draw(now);
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private release(): void {
    if (!this.gl) return;
    // Asking for the loss rather than waiting for garbage collection:
    // contexts are the scarce thing, and an agent the person deleted must
    // not keep one until the next sweep.
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this.program = null;
    this.uniforms = {};
    live.delete(this);
  }

  // --- gl -----------------------------------------------------------------

  private createContext(): boolean {
    const canvas = this.canvas;
    if (!canvas) return false;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      // Deliberately not preserved: the canvas asked for it, nothing reads
      // the buffer back, and keeping it costs a copy every frame.
      preserveDrawingBuffer: false,
    });
    if (!gl) return false;

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    const compile = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[cloud-orb] shader failed to compile:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };

    const vertex = compile(gl.VERTEX_SHADER, ORB_VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, ORB_FRAGMENT_SHADER);
    const program = vertex && fragment ? gl.createProgram() : null;
    if (!program || !vertex || !fragment) return false;

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[cloud-orb] program failed to link:', gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    // One oversized triangle rather than two: the disc is cut out in the
    // fragment shader, so there is nothing for a second to do.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = {
      uTime: gl.getUniformLocation(program, 'uTime'),
      uCount: gl.getUniformLocation(program, 'uCount'),
      uSeed: gl.getUniformLocation(program, 'uSeed'),
      uGrain: gl.getUniformLocation(program, 'uGrain'),
      uCols: gl.getUniformLocation(program, 'uCols[0]'),
    };

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    this.gl = gl;
    this.program = program;
    live.add(this);
    this.resizeCanvas();
    return true;
  }

  private onContextLost = (event: Event): void => {
    // Without this the browser will not restore, and the orb is dead for
    // the life of the window.
    event.preventDefault();
    this.stop();
    this.gl = null;
    this.program = null;
    live.delete(this);
    this.paintFallback();
  };

  private onContextRestored = (): void => {
    if (!this.isConnected) return;
    this.start();
  };

  private resizeCanvas(): void {
    const canvas = this.canvas;
    if (!canvas || !this.gl) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round((this.width || this.clientWidth) * dpr));
    const h = Math.max(1, Math.round((this.height || this.clientHeight) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  private draw(now: number): void {
    const gl = this.gl;
    if (!gl || !this.program || gl.isContextLost()) return;
    if (!this.width && !this.clientWidth) return;

    gl.useProgram(this.program);
    gl.uniform1f(this.uniforms.uTime ?? null, (now - this.startedAt) / 1000);
    gl.uniform1f(this.uniforms.uSeed ?? null, this.seed);
    gl.uniform1f(this.uniforms.uGrain ?? null, this.grain);
    gl.uniform1i(this.uniforms.uCount ?? null, this.colorCount);
    gl.uniform3fv(this.uniforms.uCols ?? null, this.colors);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}

export const CLOUD_ORB_TAG = 'cloud-orb';

/** Registers the element once. Safe to call from anywhere, any number of times. */
export function registerCloudOrb(): void {
  if (typeof customElements === 'undefined') return;
  if (customElements.get(CLOUD_ORB_TAG)) return;
  customElements.define(CLOUD_ORB_TAG, CloudOrbElement);
}

/** How many orbs currently hold a WebGL context. For diagnostics and tests. */
export function liveOrbContextCount(): number {
  return live.size;
}

export const ORB_CONTEXT_BUDGET = CONTEXT_BUDGET;
export const ORB_LIVE_MIN_PX = LIVE_MIN_PX;
