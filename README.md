# Ring Gallery

WebGL 360° image ring. Camera sits inside the circle. Each frame is a bent cylindrical panel. A pincushion fisheye (inward bulge) keeps the center readable and distorts the edges.

## Studio

```bash
npm install
npm run dev
```

Pick a ratio (16:9, 1:1, or 9:16), add one or more JPG / AVIF / GIF / MP4 files, tweak the lens. Press `F` for a chrome-free preview. `Esc` leaves a focused image, or exits preview if you are already zoomed out.

## Embed

```bash
npm run build:lib
```

```js
import { mountGallery } from "ring-gallery";

const { destroy } = mountGallery("#gallery", {
  ratio: "landscape", // "square" | "portrait"
  distribution: "ring", // "cluster"
  background: "#8f8f8f", // or `backgrounds: ["#8f8f8f", "#1c3a2a", "#0a2a44"]` per ring
  distortion: 0.05,
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

Max 24 frames. Click a frame to enter it. Swipe or arrow keys step one image; scroll spins the ring. Keys `1` `2` `3` change floors.
