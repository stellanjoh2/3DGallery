import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, MAX_ITEMS, type GallerySettings } from "./types";
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
  const [settings, setSettings] = useState<GallerySettings>(DEFAULT_SETTINGS);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const items = useMemo(
    () => slots.map((slot) => ({ src: slot.url, kind: slot.kind })),
    [slots],
  );

  const patchSettings = useCallback((patch: Partial<GallerySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const addFiles = useCallback((files: File[]) => {
    setSlots((prev) => {
      const room = MAX_ITEMS - prev.length;
      const next = files.slice(0, room).map((file) => ({
        id: newId(),
        url: URL.createObjectURL(file),
        kind: kindFromFile(file),
        name: file.name,
      }));
      if (next.length === 0) return prev;
      const merged = [...prev, ...next];
      setSelectedIndex(prev.length);
      return merged;
    });
  }, []);

  const replaceFile = useCallback(
    (file: File) => {
      setSlots((prev) => {
        if (selectedIndex < 0 || selectedIndex >= prev.length) return prev;
        const current = prev[selectedIndex];
        URL.revokeObjectURL(current.url);
        const copy = [...prev];
        copy[selectedIndex] = {
          id: current.id,
          url: URL.createObjectURL(file),
          kind: kindFromFile(file),
          name: file.name,
        };
        return copy;
      });
    },
    [selectedIndex],
  );

  const removeSelected = useCallback(() => {
    setSlots((prev) => {
      if (selectedIndex < 0 || selectedIndex >= prev.length) return prev;
      URL.revokeObjectURL(prev[selectedIndex].url);
      const copy = prev.filter((_, i) => i !== selectedIndex);
      setSelectedIndex(copy.length === 0 ? -1 : Math.min(selectedIndex, copy.length - 1));
      return copy;
    });
  }, [selectedIndex]);

  useEffect(() => {
    return () => {
      for (const slot of slots) URL.revokeObjectURL(slot.url);
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
          onSettingsChange={patchSettings}
          onAddFiles={addFiles}
          onReplaceFile={replaceFile}
          onRemoveSelected={removeSelected}
        />
      </div>

      <div className="workspace">
        <div className="stage">
          <GalleryView
            items={items}
            settings={settings}
            selectedIndex={selectedIndex}
            preview={preview}
            onSelect={setSelectedIndex}
          />

          {slots.length === 0 ? (
            <p className="empty-hint">Select a ratio, then add images.</p>
          ) : null}
        </div>

        <SlotStrip
          slots={slots}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
        />
      </div>
    </div>
  );
}
