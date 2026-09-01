type Hole = { x: number; y: number; w: number; h: number; r: number };

export type FocusPlate = {
  source: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  repeatX: number;
  repeatY: number;
  offsetX: number;
  offsetY: number;
};

/** CSS backdrop-filter over the viewport; the focused photo sits on top. */
export class FocusBlurOverlay {
  private readonly root: HTMLElement;
  private readonly pane: HTMLElement;
  private readonly plate: HTMLElement;
  private plateMedia: FocusPlate["source"] | null = null;

  constructor(host: HTMLElement) {
    host.style.position = host.style.position || "relative";

    this.root = document.createElement("div");
    this.root.setAttribute("aria-hidden", "true");
    Object.assign(this.root.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "1",
      overflow: "hidden",
      display: "none",
    });

    this.pane = document.createElement("div");
    Object.assign(this.pane.style, {
      position: "absolute",
      inset: "0",
      background: "rgba(0,0,0,0)",
    });

    this.plate = document.createElement("div");
    Object.assign(this.plate.style, {
      position: "absolute",
      overflow: "hidden",
      display: "none",
    });

    this.root.append(this.pane, this.plate);
    host.appendChild(this.root);
  }

  update(hole: Hole | null, blurPx: number, plate: FocusPlate | null): void {
    if (!hole || blurPx < 0.15) {
      this.root.style.display = "none";
      this.hidePlate();
      return;
    }

    const blur = `blur(${blurPx.toFixed(2)}px)`;
    this.root.style.display = "block";
    this.pane.style.backdropFilter = blur;
    this.pane.style.setProperty("-webkit-backdrop-filter", blur);

    if (plate) this.showPlate(hole, plate);
    else this.hidePlate();
  }

  destroy(): void {
    this.hidePlate();
    this.root.remove();
  }

  private showPlate(hole: Hole, plate: FocusPlate): void {
    this.plate.style.display = "block";
    this.plate.style.left = `${hole.x}px`;
    this.plate.style.top = `${hole.y}px`;
    this.plate.style.width = `${Math.max(0, hole.w)}px`;
    this.plate.style.height = `${Math.max(0, hole.h)}px`;
    this.plate.style.borderRadius = `${Math.max(0, hole.r)}px`;

    if (this.plateMedia !== plate.source) {
      this.plate.replaceChildren(plate.source);
      this.plateMedia = plate.source;
    }
    layoutCover(plate.source, plate);
  }

  private hidePlate(): void {
    this.plate.style.display = "none";
    this.plate.replaceChildren();
    this.plateMedia = null;
  }
}

function layoutCover(
  el: FocusPlate["source"],
  uv: Pick<FocusPlate, "repeatX" | "repeatY" | "offsetX" | "offsetY">,
): void {
  const rx = Math.max(uv.repeatX, 0.001);
  const ry = Math.max(uv.repeatY, 0.001);
  Object.assign(el.style, {
    position: "absolute",
    width: `${100 / rx}%`,
    height: `${100 / ry}%`,
    left: `${(-uv.offsetX / rx) * 100}%`,
    bottom: `${(-uv.offsetY / ry) * 100}%`,
    top: "auto",
    right: "auto",
    maxWidth: "none",
    objectFit: "fill",
    display: "block",
  });
}
