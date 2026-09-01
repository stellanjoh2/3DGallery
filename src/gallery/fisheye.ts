import {
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
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
uniform vec3 uBg;
varying vec2 vUv;

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
    gl_FragColor = sampleScene(src);
  } else {
    float ca = uChroma * r2 * 3.4 * scale;
    vec2 dir = length(d) > 0.0001 ? normalize(d) : vec2(0.0);
    vec4 cr = sampleScene(src + dir * ca);
    vec4 cg = sampleScene(src);
    vec4 cb = sampleScene(src - dir * ca);
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

  constructor() {
    this.target = new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: HalfFloatType,
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

  setSize(width: number, height: number): void {
    this.target.setSize(Math.max(1, width), Math.max(1, height));
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
}
