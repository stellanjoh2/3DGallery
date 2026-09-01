import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Texture,
  VideoTexture,
} from "three";
import type { MediaKind } from "../types";
import { applyCoverFit, sampleEnergy } from "./fitTexture";

export function kindFromFile(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("video/") || name.endsWith(".mp4")) return "video";
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  return "image";
}

export function kindFromSrc(src: string, fallback?: MediaKind): MediaKind {
  if (fallback) return fallback;
  const lower = src.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) return "video";
  if (lower.endsWith(".gif")) return "gif";
  return "image";
}

export type LoadedMedia = {
  texture: Texture;
  tick: (() => void) | null;
  dispose: () => void;
  applyFit: (panelAspect: number) => void;
};

function prepare(texture: Texture): Texture {
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const onReady = () => {
      video.removeEventListener("loadeddata", onReady);
      video.play().catch(() => {});
      resolve(video);
    };
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("error", () => reject(new Error("Failed to load video")), {
      once: true,
    });
    video.load();
  });
}

export async function loadMedia(
  src: string,
  kind: MediaKind,
): Promise<LoadedMedia> {
  if (kind === "video") {
    const video = await loadVideo(src);
    const texture = prepare(new VideoTexture(video));
    const applyFit = makeFit(
      texture,
      video,
      video.videoWidth / Math.max(1, video.videoHeight),
    );
    return {
      texture,
      tick: () => {
        texture.needsUpdate = true;
      },
      dispose: () => {
        video.pause();
        video.removeAttribute("src");
        video.load();
        texture.dispose();
      },
      applyFit,
    };
  }

  const img = await loadImage(src);
  const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);

  if (kind === "gif") {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, img.naturalWidth);
    canvas.height = Math.max(1, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context");
    const texture = prepare(new CanvasTexture(canvas));
    const applyFit = makeFit(texture, img, aspect);
    return {
      texture,
      tick: () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        texture.needsUpdate = true;
      },
      dispose: () => {
        img.src = "";
        texture.dispose();
      },
      applyFit,
    };
  }

  const texture = prepare(new Texture(img));
  return {
    texture,
    tick: null,
    dispose: () => {
      img.src = "";
      texture.dispose();
    },
    applyFit: makeFit(texture, img, aspect),
  };
}

function makeFit(
  texture: Texture,
  source: CanvasImageSource,
  aspect: number,
): (panelAspect: number) => void {
  const energy = sampleEnergy(source);
  return (panelAspect: number) => {
    applyCoverFit(texture, aspect, panelAspect, energy);
  };
}
