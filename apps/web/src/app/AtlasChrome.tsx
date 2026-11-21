import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { HOUSTON_BOOKMARKS, type BookmarkId, type EditorTool } from "../atlas/domain";
import { Icon } from "./Icon";

const compactQuery = window.matchMedia("(max-width: 800px)");
const subscribeToWidth = (listener: () => void) => {
  compactQuery.addEventListener("change", listener);
  return () => compactQuery.removeEventListener("change", listener);
};
export function useCompactAtlas() {
  return useSyncExternalStore(subscribeToWidth, () => compactQuery.matches);
}

export function AtlasHeader({
  onEarth,
  onSources,
  onAsk,
  asking,
}: {
  onEarth?: () => void;
  onSources: () => void;
  onAsk: () => void;
  asking: boolean;
}) {
  return (
    <header className="atlas-masthead">
      <div className="atlas-imprint" aria-label="EarthLab">
        <Icon name="atlas" size={32} />
        <span>EarthLab</span>
      </div>
      <h1>
        <span className="atlas-full-title">Houston Disaster Atlas</span>
        <span className="atlas-short-title">Houston atlas</span>
      </h1>
      <nav aria-label="Atlas navigation">
        {onEarth && (
          <button type="button" onClick={onEarth} aria-label="Open Earth view">
            <Icon name="globe" />
            Earth
          </button>
        )}
        <button type="button" onClick={onSources}>
          <Icon name="book" />
          Sources
        </button>
        <button
          type="button"
          className="atlas-ask-trigger"
          aria-label="Ask the atlas"
          aria-expanded={asking}
          onClick={onAsk}
        >
          <Icon name="ask" />
          Ask<span className="ask-long"> the atlas</span>
        </button>
      </nav>
    </header>
  );
}

export type NotebookPage = "scenario" | "inspector" | "compare";
const pages = [
  { id: "scenario", label: "Scenario", icon: "hurricane" },
  { id: "inspector", label: "Inspector", icon: "road" },
  { id: "compare", label: "Compare", icon: "compare" },
] as const;

export function NotebookTabs({
  page,
  onSelect,
  dock = false,
}: {
  page: NotebookPage | null;
  onSelect: (page: NotebookPage) => void;
  dock?: boolean;
}) {
  return (
    <nav
      className={dock ? "notebook-dock" : "notebook-index"}
      aria-label={dock ? "Open notebook page" : "Notebook pages"}
    >
      {pages.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={page === item.id}
          onClick={() => onSelect(item.id)}
        >
          {dock && <Icon name={item.icon} size={20} />}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export function Notebook({
  compact,
  open,
  page,
  onSelect,
  onDismiss,
  children,
}: {
  compact: boolean;
  open: boolean;
  page: NotebookPage;
  onSelect: (page: NotebookPage) => void;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sheet = dialog.current;
    if (compact && open && sheet && !sheet.open) sheet.showModal();
    else if (sheet?.open && !open) sheet.close();
  }, [open, compact]);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [page, open]);
  const body = (
    <>
      <div className="notebook-binding">
        <NotebookTabs page={page} onSelect={onSelect} />
        {compact && (
          <button className="notebook-dismiss" aria-label="Close notebook" onClick={onDismiss}>
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="notebook-scroll" ref={scroll}>
        {children}
      </div>
    </>
  );
  if (!compact)
    return (
      <aside className="desk-notebook" aria-label="Scenario notebook">
        {body}
      </aside>
    );
  return (
    <dialog
      ref={dialog}
      className="notebook-sheet"
      aria-label="Scenario notebook"
      onCancel={(e) => {
        e.preventDefault();
        onDismiss();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) onDismiss();
      }}
    >
      <div className="notebook-sheet-inner">{body}</div>
    </dialog>
  );
}

export function AtlasTools({
  bookmark,
  onBookmark,
  tool,
  onTool,
  hurricane,
}: {
  bookmark: BookmarkId;
  onBookmark: (id: BookmarkId) => void;
  tool: EditorTool;
  onTool: (id: EditorTool) => void;
  hurricane: boolean;
}) {
  const choices = [
    { id: "inspect", label: "Inspect", icon: "cursor" },
    {
      id: hurricane ? "track" : "flood",
      label: hurricane ? "Edit track" : "Edit footprint",
      icon: "edit",
    },
    { id: "closure", label: "Close roads", icon: "closure" },
  ] as const;
  const active = choices.find((choice) => choice.id === tool) ?? choices[0];
  return (
    <div className="atlas-sheet-bar">
      <div className="map-location">
        <Icon name="pin" size={20} />
        <label className="location-select">
          <select
            aria-label="Camera bookmark"
            value={bookmark}
            onChange={(e) => onBookmark(e.target.value as BookmarkId)}
          >
            {Object.entries(HOUSTON_BOOKMARKS).map(([id, entry]) => (
              <option key={id} value={id}>
                {entry.label}
              </option>
            ))}
          </select>
          <Icon name="down" size={14} />
        </label>
        {bookmark !== "houston" && (
          <button
            className="view-reset"
            onClick={() => onBookmark("houston")}
            aria-label="Reset view to Greater Houston"
            title="Reset to Greater Houston"
          >
            <Icon name="reset" size={16} />
          </button>
        )}
      </div>
      <div className="map-tool-buttons" role="group" aria-label="Map tools">
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            aria-pressed={tool === choice.id}
            onClick={() => onTool(choice.id)}
          >
            <Icon name={choice.icon} size={16} />
            {choice.label}
          </button>
        ))}
      </div>
      <label className="map-tool-select">
        <Icon name={active.icon} size={16} />
        <select
          aria-label="Map tool"
          value={tool}
          onChange={(e) => onTool(e.target.value as EditorTool)}
        >
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <Icon name="down" size={12} />
      </label>
    </div>
  );
}
