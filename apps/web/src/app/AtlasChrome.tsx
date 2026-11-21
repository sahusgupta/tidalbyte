import { useLayoutEffect, useRef, type ReactNode } from "react";
import { HOUSTON_BOOKMARKS, type BookmarkId, type EditorTool } from "../atlas/domain";
import { Icon } from "./Icon";

export type StudyPage =
  | "scenario"
  | "inspector"
  | "county"
  | "compare"
  | "layers"
  | "sources"
  | "ask"
  | "study";

const titles: Record<StudyPage, string> = {
  scenario: "Scenario settings",
  inspector: "Road inspector",
  county: "County evidence",
  compare: "Compare scenarios",
  layers: "Map layers",
  sources: "Sources & assumptions",
  ask: "Ask the atlas",
  study: "Study menu",
};

type OpenPage = (page: StudyPage) => void;
export function AtlasHeader({ hurricane, onOpen }: { hurricane: boolean; onOpen: OpenPage }) {
  return (
    <header className="field-mast">
      <div className="field-imprint">
        <span className="field-brand">
          <Icon name="field" size={26} />
          <b>
            Earth<span>Lab</span>
          </b>
        </span>
        <h1>Houston field unit</h1>
      </div>
      <button
        className="field-scenario"
        onClick={() => onOpen("scenario")}
        aria-haspopup="dialog"
        aria-label={`Scenario settings: ${hurricane ? "Gulf approach" : "Bayou footprint"}`}
      >
        <Icon name={hurricane ? "hurricane" : "flood"} size={18} />
        <span className="field-scenario-caption">Scenario</span>
        <strong>{hurricane ? "Gulf approach" : "Bayou footprint"}</strong>
        <Icon name="down" size={13} />
      </button>
      <nav className="field-nav" aria-label="Study controls">
        <button className="wide-action" onClick={() => onOpen("compare")} aria-haspopup="dialog">
          <Icon name="compare" size={17} />
          Compare
        </button>
        <button className="wide-action" onClick={() => onOpen("layers")} aria-haspopup="dialog">
          <Icon name="layers" size={17} />
          Layers
        </button>
        <button
          className="field-more"
          aria-label="Open study menu"
          aria-haspopup="dialog"
          title="Study menu"
          onClick={() => onOpen("study")}
        >
          <Icon name="more" size={21} />
        </button>
      </nav>
    </header>
  );
}

const tools = [
  { id: "inspect", label: "Inspect roads", icon: "cursor" },
  { id: "track", label: "Edit storm track", icon: "hurricane" },
  { id: "flood", label: "Edit flood footprint", icon: "flood" },
  { id: "closure", label: "Close roads", icon: "closure" },
  { id: "measure", label: "Measure distance", icon: "measure" },
] as const;

export function AtlasTools({
  tool,
  onTool,
  bookmark,
  onBookmark,
}: {
  tool: EditorTool;
  onTool: (tool: EditorTool) => void;
  bookmark: BookmarkId;
  onBookmark: (bookmark: BookmarkId) => void;
}) {
  return (
    <>
      <label className="field-location">
        <Icon name="pin" size={16} />
        <select
          value={bookmark}
          aria-label="Camera bookmark"
          onChange={(e) => onBookmark(e.target.value as BookmarkId)}
        >
          {Object.entries(HOUSTON_BOOKMARKS).map(([id, target]) => (
            <option key={id} value={id}>
              {target.label}
            </option>
          ))}
        </select>
        <Icon name="down" size={12} />
      </label>
      <label className="field-tool-picker">
        <Icon name={tools.find((item) => item.id === tool)!.icon} size={16} />
        <select
          aria-label="Map tool"
          value={tool}
          onChange={(e) => onTool(e.target.value as EditorTool)}
        >
          {tools.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <Icon name="down" size={12} />
      </label>
      <nav className="field-tools" aria-label="Map editing tools">
        {tools.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={tool === item.id}
            onClick={() => onTool(item.id)}
          >
            <Icon name={item.icon} size={20} />
            <span className="tool-tip" aria-hidden="true">
              {item.label}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}

export function StudyDialog({
  page,
  onBack,
  onClose,
  children,
}: {
  page: StudyPage;
  onBack?: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    if (page === "ask") document.getElementById("atlas-command-input")?.focus();
    else heading.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <dialog
      ref={ref}
      className={`study-dialog page-${page}`}
      aria-labelledby="study-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="study-dialog-inner">
        <header className="dialog-binding">
          {onBack && (
            <button className="dialog-back" aria-label="Back to previous panel" onClick={onBack}>
              <Icon name="arrow" size={16} />
            </button>
          )}
          <h2 id="study-dialog-title" tabIndex={-1} ref={heading}>
            {titles[page]}
          </h2>
          <button type="button" onClick={onClose} aria-label={`Close ${titles[page]}`}>
            <Icon name="close" />
          </button>
        </header>
        <div className="study-dialog-body" ref={body}>
          {children}
        </div>
      </div>
    </dialog>
  );
}

export function StudyMenu({
  onOpen,
  onEarth,
  onExport,
}: {
  onOpen: OpenPage;
  onEarth?: () => void;
  onExport: () => void;
}) {
  const destinations = [
    { page: "scenario", label: "Scenario settings", icon: "hurricane" },
    { page: "inspector", label: "Inspect a road", icon: "road" },
    { page: "compare", label: "Compare scenarios", icon: "compare" },
    { page: "layers", label: "Map layers & legend", icon: "layers" },
    { page: "ask", label: "Ask the atlas", icon: "ask" },
    { page: "sources", label: "Sources & assumptions", icon: "book" },
  ] as const;
  return (
    <nav className="study-index" aria-label="Study menu">
      {destinations.map((item) => (
        <button key={item.page} onClick={() => onOpen(item.page)}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
          <Icon name="arrow" size={14} />
        </button>
      ))}
      <button onClick={onExport}>
        <Icon name="export" />
        <span>
          Export study <small>GeoJSON</small>
        </span>
      </button>
      {onEarth && (
        <button onClick={onEarth}>
          <Icon name="globe" />
          <span>Open Earth view</span>
          <Icon name="arrow" size={14} />
        </button>
      )}
    </nav>
  );
}
