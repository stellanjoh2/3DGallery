import { useEffect, useRef } from "react";
import { RingGallery } from "../gallery/RingGallery";
import type { GalleryItem, GallerySettings } from "../types";

type GalleryViewProps = {
  rings: GalleryItem[][];
  settings: GallerySettings;
  selectedIndex: number;
  activeRing: number;
  preview: boolean;
  onSelect: (index: number, ring?: number) => void;
};

export function GalleryView({
  rings,
  settings,
  selectedIndex,
  activeRing,
  preview,
  onSelect,
}: GalleryViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const galleryRef = useRef<RingGallery | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const gallery = new RingGallery(host, {
      ...settings,
      rings,
      selectedIndex,
      selectedRing: activeRing,
      preview,
      onSelect: (index, ring) => onSelectRef.current(index, ring),
    });
    galleryRef.current = gallery;
    return () => {
      gallery.destroy();
      galleryRef.current = null;
    };
    // Mount once. Updates go through the instance API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    galleryRef.current?.setRings(rings);
  }, [rings]);

  useEffect(() => {
    galleryRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    galleryRef.current?.setActiveRing(activeRing);
  }, [activeRing]);

  useEffect(() => {
    galleryRef.current?.setSelectedIndex(selectedIndex, activeRing);
  }, [selectedIndex, activeRing]);

  useEffect(() => {
    galleryRef.current?.setPreview(preview);
  }, [preview]);

  return <div ref={hostRef} className="gallery-host" />;
}
