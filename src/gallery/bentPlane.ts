import { BufferAttribute, PlaneGeometry } from "three";

/** Plane bent onto a cylinder so the inner (concave) face looks at the origin. */
export function createBentPanel(
  width: number,
  height: number,
  radius: number,
  segments = 48,
): PlaneGeometry {
  const geo = new PlaneGeometry(width, height, segments, 1);
  const pos = geo.attributes.position;
  const r = Math.max(radius, 0.01);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const theta = x / r;
    pos.setXYZ(i, r * Math.sin(theta), y, -r * Math.cos(theta));
  }

  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** 0 = cylinder, 1 = flat plane tangent at the panel center. */
export function bendExisting(
  geo: PlaneGeometry,
  width: number,
  height: number,
  radius: number,
  flatten = 0,
): void {
  const pos = geo.attributes.position as BufferAttribute;
  const r = Math.max(radius, 0.01);
  const hw = width / 2;
  const hh = height / 2;
  const segs = geo.parameters.widthSegments;
  const bent = 1 - Math.max(0, Math.min(1, flatten));

  for (let i = 0; i < pos.count; i++) {
    const col = i % (segs + 1);
    const row = Math.floor(i / (segs + 1));
    const u = segs === 0 ? 0.5 : col / segs;
    const x = -hw + u * width;
    const y = hh - row * height;

    if (bent <= 0.001) {
      pos.setXYZ(i, x, y, -r);
      continue;
    }

    const R = r / bent;
    const theta = x / R;
    pos.setXYZ(i, R * Math.sin(theta), y, -R * Math.cos(theta) + (R - r));
  }

  pos.needsUpdate = true;
}
