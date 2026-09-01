import {
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Pincushion lens: center stays readable, edges pull inward and fray. */
const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uStrength;
uniform float uChroma;
uniform float uOverscan;
uniform vec2 uRtScale;
uniform vec3 uBg;
varying vec2 vUv;

vec2 toRt(vec2 src) {
  return (src - vec2(0.5)) * uRtScale + vec2(0.5);
}

vec4 sampleScene(vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    return vec4(uBg, 1.0);
  }
  return texture2D(tDiffuse, uv);
}

void main() {
  vec2 c = vec2(0.5);
  vec2 d = vUv - c;
  float r2 = dot(d, d);
  float k = uStrength * 2.2;
  float scale = 1.0 / max(uOverscan, 0.05);
  vec2 src = c + d * (1.0 + k * r2) * scale;

  if (uChroma < 0.001) {
    gl_FragColor = sampleScene(toRt(src));
  } else {
    float ca = uChroma * r2 * 3.4 * scale;
    vec2 dir = length(d) > 0.0001 ? normalize(d) : vec2(0.0);
    vec4 cr = sampleScene(toRt(src + dir * ca));
    vec4 cg = sampleScene(toRt(src));
    vec4 cb = sampleScene(toRt(src - dir * ca));
    gl_FragColor = vec4(cr.r, cg.g, cb.b, 1.0);
  }
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}
`;

export class FisheyePass {
  private target: WebGLRenderTarget;
  private scene = new Scene();
  private camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: ShaderMaterial;
  private quad: Mesh<PlaneGeometry, ShaderMaterial>;
  private outputW = 1;
  private outputH = 1;
  private coverageStrength = 0.45;
  private coverageOverscan = 1;
  private coverageChroma = 0;

  constructor() {
    this.target = new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      colorSpace: LinearSRGBColorSpace,
    });
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uStrength: { value: 0.45 },
        uChroma: { value: 0.25 },
        uOverscan: { value: 1 },
        uRtScale: { value: new Vector2(1, 1) },
        uBg: { value: [0, 0, 0] },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
  }

  setOutputSize(width: number, height: number): void {
    this.outputW = Math.max(1, width);
    this.outputH = Math.max(1, height);
    this.syncTarget();
  }

  /** Size the scene target for unfocused lens settings, not the animated focus fade. */
  setCoverage(strength: number, overscan: number, chroma: number): void {
    this.coverageStrength = strength;
    this.coverageOverscan = overscan;
    this.coverageChroma = chroma;
    this.syncTarget();
  }

  setStrength(value: number): void {
    this.material.uniforms.uStrength.value = value;
  }

  setChroma(value: number): void {
    this.material.uniforms.uChroma.value = value;
  }

  setOverscan(value: number): void {
    this.material.uniforms.uOverscan.value = value;
  }

  setBackground(r: number, g: number, b: number): void {
    this.material.uniforms.uBg.value = [r, g, b];
  }

  /** Scene-target size as a fraction of the output buffer (1 = no crop). */
  coverageSpan(): { x: number; y: number } {
    return {
      x: this.target.width / this.outputW,
      y: this.target.height / this.outputH,
    };
  }

  applyCameraCoverage(camera: PerspectiveCamera): void {
    const fullW = this.outputW;
    const fullH = this.outputH;
    const rtW = this.target.width;
    const rtH = this.target.height;
    if (rtW >= fullW && rtH >= fullH) {
      camera.clearViewOffset();
      camera.aspect = fullW / fullH;
      camera.updateProjectionMatrix();
      return;
    }
    camera.setViewOffset(
      fullW,
      fullH,
      (fullW - rtW) / 2,
      (fullH - rtH) / 2,
      rtW,
      rtH,
    );
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.quad.geometry.dispose();
    this.material.dispose();
  }

  private syncTarget(): void {
    const k = Math.max(0, this.coverageStrength) * 2.2;
    const scale = 1 / Math.max(this.coverageOverscan, 0.05);
    const chroma = Math.max(0, this.coverageChroma);
    const half = scale * (0.5 * (1 + 0.5 * k) + chroma * 0.5 * 3.4);
    const spanU = Math.min(1, 2 * half + 4 / this.outputW);
    const spanV = Math.min(1, 2 * half + 4 / this.outputH);
    const rtW = Math.max(1, Math.min(this.outputW, Math.round(spanU * this.outputW)));
    const rtH = Math.max(1, Math.min(this.outputH, Math.round(spanV * this.outputH)));
    this.target.setSize(rtW, rtH);
    this.material.uniforms.uRtScale.value.set(
      this.outputW / rtW,
      this.outputH / rtH,
    );
  }
}
