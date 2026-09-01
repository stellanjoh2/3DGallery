import { useEffect, useRef } from "react";
import { RingGallery } from "../gallery/RingGallery";
import type { GalleryItem, GallerySettings } from "../types";

type GalleryViewProps = {
  items: GalleryItem[];
  settings: GallerySettings;
  selectedIndex: number;
  preview: boolean;
  onSelect: (index: number) => void;
};

export function GalleryView({
  items,
  settings,
  selectedIndex,
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
      items,
      selectedIndex,
      preview,
      onSelect: (index) => onSelectRef.current(index),
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
    galleryRef.current?.setItems(items);
  }, [items]);

  useEffect(() => {
    galleryRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    galleryRef.current?.setSelectedIndex(selectedIndex);
  }, [selectedIndex]);

  useEffect(() => {
    galleryRef.current?.setPreview(preview);
  }, [preview]);

  return <div ref={hostRef} className="gallery-host" />;
}
