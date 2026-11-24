export interface ShaderUniforms {
  muzzleFlash: number;
  damageFlash: number;
  lowHpFactor: number;
  elementTint: [number, number, number];
  time: number;
  retroDither: number; // 0 = off, 1 = legacy GLES 16-bit dither feel
  dashIframe: number;  // 0..1 active tactical dash invulnerability rim
}

const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Matches the OpenGL ES 2.0 mediump shader exported in the LuaJIT/LOVE2D Android package
const FRAG_SRC = `
precision mediump float;
uniform sampler2D u_frame;
uniform float u_muzzleFlash;
uniform float u_damageFlash;
uniform float u_lowHp;
uniform vec3 u_elementTint;
uniform float u_time;
uniform float u_retroDither;
uniform float u_dashIframe;
varying vec2 v_uv;

void main() {
  vec4 col = texture2D(u_frame, v_uv);

  // Subtle barrel air scatter (world-space shadows handle full muzzle illumination)
  vec2 d = v_uv - vec2(0.5, 0.55);
  float dist = length(d);
  float flash = max(0.0, 1.0 - dist * 1.65) * u_muzzleFlash;
  col.rgb += u_elementTint * flash * 0.16;

  // Subtle electric-cyan perimeter rim during tactical dash i-frames
  if (u_dashIframe > 0.005) {
    float dashEdge = smoothstep(0.42, 0.84, dist);
    col.rgb = mix(col.rgb, vec3(0.13, 0.83, 0.93), dashEdge * clamp(u_dashIframe, 0.0, 1.0) * 0.42);
  }

  // Diegetic edge vignette for damage and low HP heartbeat
  float edge = smoothstep(0.32, 0.85, dist);
  float pulse = 0.5 + 0.5 * sin(u_time * 6.5);
  float danger = clamp(u_damageFlash * 0.85 + u_lowHp * (0.25 + 0.25 * pulse), 0.0, 0.9);
  col.rgb = mix(col.rgb, vec3(0.88, 0.11, 0.14), edge * danger);

  // Optional 16-bit GLES2 ordered dither simulation for legacy Android GPU preview
  if (u_retroDither > 0.5) {
    float scan = sin(v_uv.y * 540.0) * 0.025;
    col.rgb -= scan;
  }

  gl_FragColor = vec4(clamp(col.rgb, 0.0, 1.0), 1.0);
}
`;

export class GLESPresenter {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private contextLost = false;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.offscreen = document.createElement('canvas');
    this.offCtx = this.offscreen.getContext('2d')!;
    this.initWebGL();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.initWebGL();
    });
  }

  private initWebGL(): void {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      this.ctx2d = this.canvas.getContext('2d');
      return;
    }
    this.gl = gl;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.program = prog;

    const verts = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const aUv = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aUv);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texture = tex;

    this.uniforms = {
      frame: gl.getUniformLocation(prog, 'u_frame'),
      muzzleFlash: gl.getUniformLocation(prog, 'u_muzzleFlash'),
      damageFlash: gl.getUniformLocation(prog, 'u_damageFlash'),
      lowHp: gl.getUniformLocation(prog, 'u_lowHp'),
      elementTint: gl.getUniformLocation(prog, 'u_elementTint'),
      time: gl.getUniformLocation(prog, 'u_time'),
      retroDither: gl.getUniformLocation(prog, 'u_retroDither'),
      dashIframe: gl.getUniformLocation(prog, 'u_dashIframe'),
    };
  }

  public present(imageData: ImageData, u: ShaderUniforms): void {
    const w = imageData.width;
    const h = imageData.height;

    if (this.gl && this.program && this.texture && !this.contextLost) {
      const gl = this.gl;
      if (this.canvas.width !== this.canvas.clientWidth || this.canvas.height !== this.canvas.clientHeight) {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        this.canvas.width = Math.max(320, Math.floor(this.canvas.clientWidth * dpr));
        this.canvas.height = Math.max(180, Math.floor(this.canvas.clientHeight * dpr));
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);

      gl.uniform1i(this.uniforms.frame, 0);
      gl.uniform1f(this.uniforms.muzzleFlash, u.muzzleFlash);
      gl.uniform1f(this.uniforms.damageFlash, u.damageFlash);
      gl.uniform1f(this.uniforms.lowHp, u.lowHpFactor);
      gl.uniform3f(this.uniforms.elementTint, u.elementTint[0], u.elementTint[1], u.elementTint[2]);
      gl.uniform1f(this.uniforms.time, u.time);
      gl.uniform1f(this.uniforms.retroDither, u.retroDither);
      gl.uniform1f(this.uniforms.dashIframe, u.dashIframe);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return;
    }

    // Fallback 2D canvas blit if WebGL context unavailable
    if (this.ctx2d) {
      if (this.offscreen.width !== w || this.offscreen.height !== h) {
        this.offscreen.width = w;
        this.offscreen.height = h;
      }
      this.offCtx.putImageData(imageData, 0, 0);
      this.ctx2d.imageSmoothingEnabled = false;
      this.ctx2d.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
