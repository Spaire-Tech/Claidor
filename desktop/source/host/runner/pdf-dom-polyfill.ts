/**
 * pdf.js's display module evaluates `new DOMMatrix()` at load
 * (pdfjs-dist/legacy/build/pdf.mjs, `const SCALE_MATRIX = new DOMMatrix()`),
 * and on Node it fills that global from the optional `@napi-rs/canvas`
 * package, which the host bundle does not carry and the box does not have.
 * Without it the module throws before any text can be read. Text extraction
 * never renders, so a 2D affine matrix with the handful of methods pdf.js's
 * canvas code calls is enough to let the module load; it is installed only
 * when the runtime has no DOMMatrix of its own, and never over a real one.
 *
 * Import this module before any pdfjs-dist import: ES module imports
 * evaluate in order, so the side effect lands first.
 */

interface MatrixLike {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

class AffineDOMMatrix implements MatrixLike {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: ArrayLike<number> | MatrixLike | string) {
    if (init === undefined || typeof init === "string") return;
    if (typeof (init as ArrayLike<number>).length === "number") {
      const values = init as ArrayLike<number>;
      if (values.length === 6) [this.a, this.b, this.c, this.d, this.e, this.f] = [values[0] ?? 1, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1, values[4] ?? 0, values[5] ?? 0];
      else if (values.length === 16) [this.a, this.b, this.c, this.d, this.e, this.f] = [values[0] ?? 1, values[1] ?? 0, values[4] ?? 0, values[5] ?? 1, values[12] ?? 0, values[13] ?? 0];
      return;
    }
    const other = init as MatrixLike;
    this.a = other.a; this.b = other.b; this.c = other.c; this.d = other.d; this.e = other.e; this.f = other.f;
  }

  get is2D(): boolean { return true; }
  get isIdentity(): boolean { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
  get m11(): number { return this.a; }
  get m12(): number { return this.b; }
  get m21(): number { return this.c; }
  get m22(): number { return this.d; }
  get m41(): number { return this.e; }
  get m42(): number { return this.f; }

  private set(m: MatrixLike): this {
    this.a = m.a; this.b = m.b; this.c = m.c; this.d = m.d; this.e = m.e; this.f = m.f;
    return this;
  }

  /** this × other, in the DOMMatrix sense (other applied first). */
  multiply(other: MatrixLike): AffineDOMMatrix {
    return new AffineDOMMatrix({
      a: this.a * other.a + this.c * other.b,
      b: this.b * other.a + this.d * other.b,
      c: this.a * other.c + this.c * other.d,
      d: this.b * other.c + this.d * other.d,
      e: this.a * other.e + this.c * other.f + this.e,
      f: this.b * other.e + this.d * other.f + this.f,
    });
  }
  multiplySelf(other: MatrixLike): this { return this.set(this.multiply(other)); }
  preMultiplySelf(other: MatrixLike): this { return this.set(new AffineDOMMatrix(other).multiply(this)); }
  translate(tx = 0, ty = 0): AffineDOMMatrix { return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }); }
  translateSelf(tx = 0, ty = 0): this { return this.set(this.translate(tx, ty)); }
  scale(sx = 1, sy = sx, _sz = 1, ox = 0, oy = 0): AffineDOMMatrix {
    return this.translate(ox, oy).multiply({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }).translate(-ox, -oy);
  }
  scaleSelf(sx = 1, sy = sx, sz = 1, ox = 0, oy = 0): this { return this.set(this.scale(sx, sy, sz, ox, oy)); }
  inverse(): AffineDOMMatrix {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return new AffineDOMMatrix({ a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN });
    return new AffineDOMMatrix({
      a: this.d / det,
      b: -this.b / det,
      c: -this.c / det,
      d: this.a / det,
      e: (this.c * this.f - this.d * this.e) / det,
      f: (this.b * this.e - this.a * this.f) / det,
    });
  }
  invertSelf(): this { return this.set(this.inverse()); }
  transformPoint(point: { x?: number; y?: number } = {}): { x: number; y: number; z: number; w: number } {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
  toFloat32Array(): Float32Array { return new Float32Array(this.toFloat64Array()); }
  toFloat64Array(): Float64Array {
    return new Float64Array([this.a, this.b, 0, 0, this.c, this.d, 0, 0, 0, 0, 1, 0, this.e, this.f, 0, 1]);
  }
  toString(): string { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
}

export const PDF_DOM_MATRIX_POLYFILL_INSTALLED: boolean = (() => {
  const scope = globalThis as { DOMMatrix?: unknown };
  if (scope.DOMMatrix !== undefined) return false;
  scope.DOMMatrix = AffineDOMMatrix;
  return true;
})();
