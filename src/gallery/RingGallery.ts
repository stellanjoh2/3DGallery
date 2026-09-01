import gsap from "gsap";
import {
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { createBentPanel, bendExisting } from "./bentPlane";
import { FisheyePass } from "./fisheye";
import { itemSize, ringRadius, slotAngles } from "./layout";
import { kindFromSrc, loadMedia, type LoadedMedia } from "./media";
import { createPanelMaterial, setPanelCorners } from "./panelMaterial";
import { FocusBlurOverlay, type FocusPlate } from "./focusBlur";
import {
  DEFAULT_SETTINGS,
  MAX_ITEMS,
  type GalleryItem,
  type GalleryOptions,
  type GallerySettings,
} from "../types";

const SEGMENTS = 48;
const HOME_Y = 0.04;
const BASE_FOV = 72;
const DOLLY = 0.26;
const SPIN_MAX = 4.2;
const WHEEL_MAX = 0.72;
const ZOOM_IN = 0.4;
const ZOOM_OUT = 0.32;
const DIM_OPACITY = 0.5;
const FOCUS_BLUR_PX = 16;

type Panel = {
  group: Group;
  mesh: Mesh<PlaneGeometry, MeshBasicMaterial>;
  angle: number;
  targetAngle: number;
  flatten: number;
  src: string;
  loadGen: number;
  media: LoadedMedia | null;
};

export class RingGallery {
  readonly el: HTMLElement;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private axis = new Group();
  private ring = new Group();
  private fisheye = new FisheyePass();
  private focusBlur: FocusBlurOverlay;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private ndc = new Vector3();
  private bg = new Color(DEFAULT_SETTINGS.background);

  private settings: GallerySettings = { ...DEFAULT_SETTINGS };
  private items: GalleryItem[] = [];
  private panels: Panel[] = [];
  private selectedIndex = -1;
  private facedIndex = -1;
  private onSelect: ((index: number) => void) | null = null;

  private radius = ringRadius(0, "landscape");
  private targetRadius = this.radius;
  private spin = 0;
  private spinVel = 0;
  private aligning = false;
  private focusT = 0;
  private focusPoint = new Vector3(0, 0, -3.3);
  private homePos = new Vector3(0, HOME_Y, 0);
  private homeLook = new Vector3(0, 0, -1);
  private camPos = new Vector3();
  private camLook = new Vector3();
  private zoomPos = new Vector3();
  private dragging = false;
  private moved = false;
  private lastX = 0;
  private lastDragT = 0;
  private lastT = 0;
  private raf = 0;
  private disposed = false;
  private ro: ResizeObserver;

  constructor(el: HTMLElement, options: GalleryOptions = {}) {
    this.el = el;
    this.settings = { ...DEFAULT_SETTINGS, ...pickSettings(options) };
    this.items = options.items?.slice(0, MAX_ITEMS) ?? [];
    this.selectedIndex = options.selectedIndex ?? -1;
    this.onSelect = options.onSelect ?? null;
    this.bg.set(this.settings.background);

    this.camera = new PerspectiveCamera(BASE_FOV, 1, 0.08, 80);

    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(this.bg, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.touchAction = "none";
    el.appendChild(this.renderer.domElement);
    this.focusBlur = new FocusBlurOverlay(el);

    this.scene.background = this.bg;
    this.axis.add(this.ring);
    this.scene.add(this.axis);
    this.fisheye.setBackground(this.bg.r, this.bg.g, this.bg.b);
    this.fisheye.setChroma(this.settings.chromaticAberration);
    this.fisheye.setOverscan(this.settings.overscan);
    this.syncFisheyeCoverage();
    this.applyView();
    this.applyCamera();

    this.radius = ringRadius(this.items.length, this.settings.ratio);
    this.targetRadius = this.radius;
    if (this.items.length) this.syncPanels();
    if (this.selectedIndex >= 0) this.focusIndex(this.selectedIndex);

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.loop = this.loop.bind(this);

    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKeyDown);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.resize();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setItems(items: GalleryItem[]): void {
    const next = items.slice(0, MAX_ITEMS);
    const unchanged =
      next.length === this.items.length &&
      next.every((item, i) => item.src === this.items[i]?.src);
    this.items = next;
    this.targetRadius = ringRadius(this.items.length, this.settings.ratio);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = this.items.length - 1;
      if (this.selectedIndex < 0) this.blurFocus();
    }
    if (unchanged) return;
    this.syncPanels();
  }

  setSettings(patch: Partial<GallerySettings>): void {
    const next = { ...this.settings, ...patch };
    const ratioChanged = next.ratio !== this.settings.ratio;
    const distributionChanged = next.distribution !== this.settings.distribution;
    const cornersChanged = next.cornerRadius !== this.settings.cornerRadius;
    this.settings = next;

    if (patch.background) {
      this.bg.set(patch.background);
      this.scene.background = this.bg;
      this.renderer.setClearColor(this.bg, 1);
      this.fisheye.setBackground(this.bg.r, this.bg.g, this.bg.b);
    }
    if (patch.chromaticAberration != null) this.fisheye.setChroma(patch.chromaticAberration);
    if (patch.overscan != null) this.fisheye.setOverscan(patch.overscan);
    this.syncFisheyeCoverage();
    this.applyView();

    if (ratioChanged) {
      this.targetRadius = ringRadius(this.items.length, this.settings.ratio);
      this.applyCorners();
      this.fitPanelTextures();
      this.layoutPanels(true);
    } else if (distributionChanged) {
      this.layoutPanels(true);
    } else if (cornersChanged) {
      this.applyCorners();
    }
  }

  setSelectedIndex(index: number): void {
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    if (index < 0) this.blurFocus();
    else this.focusIndex(index);
  }

  setPreview(_preview: boolean): void {}

  setOnSelect(cb: ((index: number) => void) | null): void {
    this.onSelect = cb;
  }

  destroy(): void {
    this.disposed = true;
    gsap.killTweensOf(this);
    for (const panel of this.panels) {
      gsap.killTweensOf(panel);
      gsap.killTweensOf(panel.mesh.material);
    }
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKeyDown);
    this.clearPanels();
    this.focusBlur.destroy();
    this.fisheye.dispose();
    this.renderer.dispose();
    canvas.remove();
  }

  private applyCorners(): void {
    const { width, height } = itemSize(this.settings.ratio);
    const aspect = width / height;
    const radius = this.settings.cornerRadius;
    for (const panel of this.panels) {
      setPanelCorners(panel.mesh.material, radius, aspect);
    }
  }

  private fitPanelTextures(): void {
    const { width, height } = itemSize(this.settings.ratio);
    const aspect = width / height;
    for (const panel of this.panels) {
      panel.media?.applyFit(aspect);
    }
  }

  private syncPanels(): void {
    const count = this.items.length;
    while (this.panels.length > count) {
      const panel = this.panels.pop();
      if (panel) disposePanel(panel, this.ring);
    }
    while (this.panels.length < count) {
      this.panels.push(this.makePanel());
    }
    this.layoutPanels(true);
    this.items.forEach((item, i) => {
      const panel = this.panels[i];
      if (!panel || panel.src === item.src) return;
      panel.src = item.src;
      panel.loadGen += 1;
      void this.loadPanel(i, item, panel.loadGen);
    });
  }

  private makePanel(): Panel {
    const { width, height } = itemSize(this.settings.ratio);
    const geo = createBentPanel(width, height, this.radius, SEGMENTS);
    const aspect = width / height;
    const material = createPanelMaterial(
      { color: 0x141414 },
      this.settings.cornerRadius,
      aspect,
    );

    const mesh = new Mesh(geo, material);
    const group = new Group();
    group.add(mesh);
    this.ring.add(group);

    return {
      group,
      mesh,
      angle: 0,
      targetAngle: 0,
      flatten: 0,
      src: "",
      loadGen: 0,
      media: null,
    };
  }

  private layoutPanels(snap: boolean): void {
    const angles = slotAngles(
      this.panels.length,
      this.settings.ratio,
      this.radius,
      this.settings.distribution,
    );
    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i];
      panel.targetAngle = angles[i] ?? 0;
      if (snap) panel.angle = panel.targetAngle;
      this.applyPanelShape(panel);
      panel.group.rotation.y = panel.angle;
    }
  }

  private async loadPanel(index: number, item: GalleryItem, gen: number): Promise<void> {
    try {
      const kind = kindFromSrc(item.src, item.kind);
      const media = await loadMedia(item.src, kind);
      const panel = this.panels[index];
      if (this.disposed || !panel || panel.loadGen !== gen) {
        media.dispose();
        return;
      }
      panel.media?.dispose();
      panel.media = media;
      panel.mesh.material.map = media.texture;
      panel.mesh.material.color.set(0xffffff);
      panel.mesh.material.needsUpdate = true;
      const { width, height } = itemSize(this.settings.ratio);
      media.applyFit(width / height);
    } catch {
      /* keep empty plate */
    }
  }

  private clearPanels(): void {
    for (const panel of this.panels) disposePanel(panel, this.ring);
    this.panels = [];
  }

  private resize(): void {
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.fisheye.setOutputSize(Math.round(w * dpr), Math.round(h * dpr));
    this.syncFisheyeCoverage();
    this.applyView();
  }

  private loop(now: number): void {
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;

    const k = 1 - Math.exp(-dt * 7);
    this.radius += (this.targetRadius - this.radius) * k;
    if (Math.abs(this.targetRadius - this.radius) > 0.0008) {
      this.layoutPanels(false);
    }

    for (const panel of this.panels) {
      panel.angle += (panel.targetAngle - panel.angle) * k;
      panel.group.rotation.y = panel.angle;
      panel.media?.tick?.();
    }

    if (!this.dragging && !this.aligning) {
      this.spin += this.spinVel * dt;
      const speed = Math.abs(this.spinVel);
      if (speed > 0) {
        const linear = 1.05 + this.settings.spinFriction * 3.75;
        const drop = linear * (0.7 + 0.3 * (speed / (speed + 0.45))) * dt;
        this.spinVel = speed <= drop ? 0 : this.spinVel - Math.sign(this.spinVel) * drop;
      }
    }
    this.ring.rotation.y = this.spin;
    this.applyView();
    this.applyCamera();

    const plate = this.focusPlate();
    const mesh = this.panels[this.selectedIndex]?.mesh;
    if (plate && mesh) mesh.visible = false;
    this.fisheye.render(this.renderer, this.scene, this.camera);
    if (mesh) mesh.visible = true;
    this.syncFocusBlur(plate);
    this.raf = requestAnimationFrame(this.loop);
  }

  private applyView(): void {
    const t = this.focusT;
    const axisX = this.settings.axisTilt * (1 - t);
    const axisZ = this.settings.ringTilt * (1 - t);
    this.axis.rotation.x = (axisX * Math.PI) / 180;
    this.axis.rotation.z = (axisZ * Math.PI) / 180;

    const primary = safeZoom(this.settings.cameraZoom);
    const focused = safeZoom(this.settings.focusZoom);
    this.camera.fov = BASE_FOV / (primary + (focused - primary) * t);
    this.fisheye.setStrength(this.settings.distortion * (1 - t));
    this.fisheye.setChroma(this.settings.chromaticAberration * (1 - t));
    this.fisheye.applyCameraCoverage(this.camera);
  }

  private syncFisheyeCoverage(): void {
    this.fisheye.setCoverage(
      this.settings.distortion,
      this.settings.overscan,
      this.settings.chromaticAberration,
    );
  }

  private applyCamera(): void {
    if (this.focusT > 0.001) {
      this.focusPoint.set(0, 0, -this.radius);
      this.axis.localToWorld(this.focusPoint);
      this.zoomPos.copy(this.homePos).lerp(this.focusPoint, DOLLY);
      this.camPos.copy(this.homePos).lerp(this.zoomPos, this.focusT);
      this.camLook.copy(this.homeLook).lerp(this.focusPoint, this.focusT);
    } else {
      this.camPos.copy(this.homePos);
      this.camLook.copy(this.homeLook);
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  private motionDuration(seconds: number): number {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : seconds;
  }

  private applyPanelShape(panel: Panel): void {
    const { width, height } = itemSize(this.settings.ratio);
    bendExisting(panel.mesh.geometry, width, height, this.radius, panel.flatten);
  }

  private syncFocusBlur(plate: FocusPlate | null): void {
    const t = this.focusT;
    if (t < 0.01 || this.selectedIndex < 0) {
      this.focusBlur.update(null, 0, null);
      return;
    }
    this.focusBlur.update(this.focusedPanelHole(), t * FOCUS_BLUR_PX, plate);
  }

  private focusPlate(): FocusPlate | null {
    if (this.focusT < 0.01 || this.selectedIndex < 0) return null;
    const panel = this.panels[this.selectedIndex];
    const map = panel?.mesh.material.map;
    const source = map?.image;
    if (
      !(source instanceof HTMLImageElement) &&
      !(source instanceof HTMLVideoElement) &&
      !(source instanceof HTMLCanvasElement)
    ) {
      return null;
    }
    return {
      source,
      repeatX: map.repeat.x,
      repeatY: map.repeat.y,
      offsetX: map.offset.x,
      offsetY: map.offset.y,
    };
  }

  private focusedPanelHole(): { x: number; y: number; w: number; h: number; r: number } | null {
    const panel = this.panels[this.selectedIndex];
    if (!panel) return null;

    const pos = panel.mesh.geometry.attributes.position;
    const segs = panel.mesh.geometry.parameters.widthSegments;
    const corners = [0, segs, segs + 1, (segs + 1) * 2 - 1];
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    const overscan = Math.max(this.settings.overscan, 0.05);
    const span = this.fisheye.coverageSpan();

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const i of corners) {
      this.ndc.fromBufferAttribute(pos, i);
      panel.mesh.localToWorld(this.ndc);
      this.ndc.project(this.camera);
      const sx = (0.5 + this.ndc.x * 0.5 * overscan * span.x) * w;
      const sy = (0.5 - this.ndc.y * 0.5 * overscan * span.y) * h;
      minX = Math.min(minX, sx);
      maxX = Math.max(maxX, sx);
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }

    if (!Number.isFinite(minX)) return null;
    const wPx = maxX - minX;
    const hPx = maxY - minY;
    return {
      x: minX,
      y: minY,
      w: wPx,
      h: hPx,
      r: this.settings.cornerRadius * Math.min(wPx, hPx),
    };
  }

  private applyFocusPresentation(): void {
    const focusing = this.selectedIndex >= 0;
    const duration = this.motionDuration(focusing ? ZOOM_IN : ZOOM_OUT);
    const ease = focusing ? "power3.out" : "power2.inOut";

    for (let i = 0; i < this.panels.length; i++) {
      const panel = this.panels[i];
      const flatten = i === this.selectedIndex ? 1 : 0;
      const opacity = focusing && i !== this.selectedIndex ? DIM_OPACITY : 1;
      gsap.to(panel, {
        flatten,
        duration,
        ease,
        overwrite: "auto",
        onUpdate: () => this.applyPanelShape(panel),
        onComplete: () => this.applyPanelShape(panel),
      });
      gsap.to(panel.mesh.material, {
        opacity,
        duration,
        ease,
        overwrite: "auto",
      });
    }
  }

  private focusIndex(index: number): void {
    this.faceIndex(index, true);
    this.applyFocusPresentation();
  }

  private faceIndex(index: number, focus: boolean): void {
    const panel = this.panels[index];
    if (!panel) return;
    this.spinVel = 0;
    this.aligning = true;
    this.facedIndex = index;
    const facing = shortestSpin(this.spin, -panel.angle);
    gsap.killTweensOf(this, focus ? "spin,focusT" : "spin");
    gsap.to(this, {
      spin: facing,
      ...(focus ? { focusT: 1 } : {}),
      duration: this.motionDuration(ZOOM_IN),
      ease: "power3.out",
      overwrite: "auto",
      onComplete: () => {
        this.aligning = false;
      },
    });
  }

  private blurFocus(): void {
    this.aligning = false;
    gsap.killTweensOf(this, "focusT");
    gsap.to(this, {
      focusT: 0,
      duration: this.motionDuration(ZOOM_OUT),
      ease: "power2.inOut",
      overwrite: "auto",
    });
    this.applyFocusPresentation();
  }

  private choose(index: number): void {
    this.selectedIndex = index;
    if (index < 0) this.blurFocus();
    else this.focusIndex(index);
    this.onSelect?.(index);
  }

  private frontIndex(): number {
    const n = this.panels.length;
    if (n === 0) return -1;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dist = Math.abs(shortestSpin(0, this.panels[i].angle + this.spin));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  private currentItem(): number {
    if (this.selectedIndex >= 0) return this.selectedIndex;
    if (this.aligning && this.facedIndex >= 0) return this.facedIndex;
    return this.frontIndex();
  }

  private step(delta: number): void {
    const n = this.panels.length;
    if (n <= 1) return;
    const current = this.currentItem();
    if (current < 0) return;
    const next = (current + delta + n) % n;
    if (this.selectedIndex >= 0) this.choose(next);
    else this.faceIndex(next, false);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    if (this.panels.length === 0) return;

    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        if (this.selectedIndex < 0) this.choose(this.currentItem());
        break;
      case "ArrowDown":
        event.preventDefault();
        if (this.selectedIndex >= 0) this.choose(-1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        this.step(1);
        break;
      case "ArrowRight":
        event.preventDefault();
        this.step(-1);
        break;
    }
  }

  private releaseSpin(): void {
    this.aligning = false;
    gsap.killTweensOf(this, "spin");
  }

  private onPointerDown(event: PointerEvent): void {
    this.dragging = true;
    this.moved = false;
    this.lastX = event.clientX;
    this.lastDragT = performance.now();
    this.spinVel = 0;
    this.releaseSpin();
    this.renderer.domElement.setPointerCapture(event.pointerId);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    const now = performance.now();
    const dt = Math.max(0.001, (now - this.lastDragT) / 1000);
    const dx = event.clientX - this.lastX;
    if (Math.abs(dx) > 3) this.moved = true;
    this.lastX = event.clientX;
    this.lastDragT = now;
    if (!this.moved) return;
    if (this.selectedIndex >= 0) this.choose(-1);
    const w = Math.max(1, this.el.clientWidth);
    const delta = (dx / w) * Math.PI * 1.35;
    this.spin += delta;
    const instant = delta / dt;
    this.spinVel = this.spinVel * 0.2 + instant * 0.8;
    if (this.spinVel > SPIN_MAX) this.spinVel = SPIN_MAX;
    else if (this.spinVel < -SPIN_MAX) this.spinVel = -SPIN_MAX;
  }

  private onPointerUp(event: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      this.renderer.domElement.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    if (performance.now() - this.lastDragT > 80) this.spinVel = 0;
    if (this.moved || this.panels.length === 0) return;
    this.pick(event.clientX, event.clientY);
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.releaseSpin();
    if (this.selectedIndex >= 0) this.choose(-1);
    const raw = event.deltaY + event.deltaX;
    const px =
      event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * 400 : raw;
    const tick = Math.max(-40, Math.min(40, px));
    this.spin += tick * 0.001;
    this.spinVel += tick * 0.0018;
    if (this.spinVel > WHEEL_MAX) this.spinVel = WHEEL_MAX;
    else if (this.spinVel < -WHEEL_MAX) this.spinVel = -WHEEL_MAX;
  }

  private pick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.camera.clearViewOffset();
    this.camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
    this.camera.updateProjectionMatrix();
    try {
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(
        this.panels.map((p) => p.mesh),
        false,
      );
      const hit = hits[0];
      if (!hit) {
        if (this.selectedIndex >= 0) this.choose(-1);
        return;
      }
      const index = this.panels.findIndex((p) => p.mesh === hit.object);
      if (index < 0) return;
      this.choose(index === this.selectedIndex ? -1 : index);
    } finally {
      this.fisheye.applyCameraCoverage(this.camera);
    }
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function safeZoom(zoom: number): number {
  const safe = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.max(0.4, safe);
}

function shortestSpin(from: number, to: number): number {
  let delta = to - from;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta;
}

function pickSettings(options: GalleryOptions): Partial<GallerySettings> {
  const patch: Partial<GallerySettings> = {};
  if (options.ratio != null) patch.ratio = options.ratio;
  if (options.distribution != null) patch.distribution = options.distribution;
  if (options.background != null) patch.background = options.background;
  if (options.distortion != null) patch.distortion = options.distortion;
  if (options.chromaticAberration != null) {
    patch.chromaticAberration = options.chromaticAberration;
  }
  if (options.overscan != null) patch.overscan = options.overscan;
  if (options.cameraZoom != null) patch.cameraZoom = options.cameraZoom;
  if (options.focusZoom != null) patch.focusZoom = options.focusZoom;
  if (options.spinFriction != null) patch.spinFriction = options.spinFriction;
  if (options.cornerRadius != null) patch.cornerRadius = options.cornerRadius;
  if (options.axisTilt != null) patch.axisTilt = options.axisTilt;
  if (options.ringTilt != null) patch.ringTilt = options.ringTilt;
  return patch;
}

function disposePanel(panel: Panel, ring: Group): void {
  gsap.killTweensOf(panel);
  gsap.killTweensOf(panel.mesh.material);
  panel.media?.dispose();
  panel.mesh.geometry.dispose();
  panel.mesh.material.dispose();
  ring.remove(panel.group);
}
