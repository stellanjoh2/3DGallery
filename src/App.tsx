import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  MAX_ITEMS,
  MAX_RINGS,
  padBackgrounds,
  type GallerySettings,
} from "./types";
import { kindFromFile } from "./gallery/media";
import { ControlsPanel } from "./studio/ControlsPanel";
import { GalleryView } from "./studio/GalleryView";
import { SlotStrip, type Slot } from "./studio/SlotStrip";
import "./App.css";

function newId(): string {
  return crypto.randomUUID?.() ?? `slot-${Date.now()}-${Math.random()}`;
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

export function App() {
  const [preview, setPreview] = useState(false);
  const [settings, setSettings] = useState<GallerySettings>(() => ({
    ...DEFAULT_SETTINGS,
    backgrounds: padBackgrounds(DEFAULT_SETTINGS.backgrounds),
  }));
  const [floors, setFloors] = useState<Slot[][]>([[]]);
  const [activeRing, setActiveRing] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const slots = floors[activeRing] ?? floors[0] ?? [];
  const rings = useMemo(
    () =>
      floors.map((floor) =>
        floor.map((slot) => ({ src: slot.url, kind: slot.kind })),
      ),
    [floors],
  );
  const totalItems = floors.reduce((n, floor) => n + floor.length, 0);

  const patchSettings = useCallback((patch: Partial<GallerySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelect = useCallback((index: number, ring = 0) => {
    setActiveRing(ring);
    setSelectedIndex(index);
  }, []);

  const setFloor = useCallback((ring: number) => {
    setActiveRing(ring);
    setSelectedIndex(-1);
  }, []);

  const addRing = useCallback(() => {
    setFloors((prev) => {
      if (prev.length >= MAX_RINGS) return prev;
      setActiveRing(prev.length);
      setSelectedIndex(-1);
      return [...prev, []];
    });
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      setFloors((prev) => {
        const ring = Math.min(activeRing, prev.length - 1);
        const floor = prev[ring] ?? [];
        const room = MAX_ITEMS - floor.length;
        const next = files.slice(0, room).map((file) => ({
          id: newId(),
          url: URL.createObjectURL(file),
          kind: kindFromFile(file),
          name: file.name,
        }));
        if (next.length === 0) return prev;
        const copy = prev.map((items, i) => (i === ring ? [...items, ...next] : items));
        return copy;
      });
    },
    [activeRing],
  );

  const replaceFile = useCallback(
    (file: File) => {
      setFloors((prev) => {
        const ring = Math.min(activeRing, prev.length - 1);
        const floor = prev[ring] ?? [];
        if (selectedIndex < 0 || selectedIndex >= floor.length) return prev;
        const current = floor[selectedIndex];
        URL.revokeObjectURL(current.url);
        const copy = prev.map((items, i) => {
          if (i !== ring) return items;
          const next = [...items];
          next[selectedIndex] = {
            id: current.id,
            url: URL.createObjectURL(file),
            kind: kindFromFile(file),
            name: file.name,
          };
          return next;
        });
        return copy;
      });
    },
    [activeRing, selectedIndex],
  );

  const removeSelected = useCallback(() => {
    setFloors((prev) => {
      const ring = Math.min(activeRing, prev.length - 1);
      const floor = prev[ring] ?? [];
      if (selectedIndex < 0 || selectedIndex >= floor.length) return prev;
      URL.revokeObjectURL(floor[selectedIndex].url);
      const nextFloor = floor.filter((_, i) => i !== selectedIndex);
      setSelectedIndex(nextFloor.length === 0 ? -1 : Math.min(selectedIndex, nextFloor.length - 1));
      return prev.map((items, i) => (i === ring ? nextFloor : items));
    });
  }, [activeRing, selectedIndex]);

  useEffect(() => {
    return () => {
      for (const floor of floors) {
        for (const slot of floor) URL.revokeObjectURL(slot.url);
      }
    };
    // Only on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setPreview((open) => !open);
        return;
      }
      if (event.key === "Escape") setPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={preview ? "app is-preview" : "app"}>
      <div className="app-chrome">
        <ControlsPanel
          settings={settings}
          itemCount={slots.length}
          selectedIndex={selectedIndex}
          canReplace={selectedIndex >= 0}
          ringCount={floors.length}
          activeRing={activeRing}
          onSettingsChange={patchSettings}
          onAddFiles={addFiles}
          onReplaceFile={replaceFile}
          onRemoveSelected={removeSelected}
          onAddRing={addRing}
          onActiveRingChange={setFloor}
        />
      </div>

      <div className="workspace">
        <div className="stage">
          <GalleryView
            rings={rings}
            settings={settings}
            selectedIndex={selectedIndex}
            activeRing={activeRing}
            preview={preview}
            onSelect={handleSelect}
          />

          {totalItems === 0 ? (
            <p className="empty-hint">Select a ratio, then add images.</p>
          ) : null}
        </div>

        <SlotStrip
          slots={slots}
          selectedIndex={selectedIndex}
          activeRing={activeRing}
          ringCount={floors.length}
          onSelect={setSelectedIndex}
        />
      </div>
    </div>
  );
}
