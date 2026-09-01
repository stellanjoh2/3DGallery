# Ring Gallery

WebGL 360° image ring. Camera sits inside the circle. Each frame is a bent cylindrical panel. A pincushion fisheye (inward bulge) keeps the center readable and distorts the edges.

## Studio

```bash
npm install
npm run dev
```

Pick a ratio (16:9, 1:1, or 9:16), add one or more JPG / AVIF / GIF / MP4 files, tweak the lens. Press `F` to toggle a chrome-free preview (`Esc` also exits).

## Embed

```bash
npm run build:lib
```

```js
import { mountGallery } from "ring-gallery";

const { destroy } = mountGallery("#gallery", {
  ratio: "portrait", // "landscape" | "square"
  distribution: "ring", // "cluster"
  background: "#8f8f8f", // or `backgrounds: ["#8f8f8f", "#1c3a2a", "#0a2a44"]` per ring
  distortion: 0.15,
  chromaticAberration: 0.002,
  overscan: 1.75,
  cameraZoom: 0.83,
  focusZoom: 1,
  spinFriction: 0.15,
  cornerRadius: 0.04,
  axisTilt: -5,
  ringTilt: -13,
  items: [
    { src: "/a.jpg" },
    { src: "/b.mp4", kind: "video" },
    { src: "/c.gif", kind: "gif" },
  ],
});
```

Max 24 frames. Drag or scroll to spin the ring.
