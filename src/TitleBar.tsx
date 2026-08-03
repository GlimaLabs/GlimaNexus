import { getCurrentWindow } from "@tauri-apps/api/window";

function currentWindow() {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export default function TitleBar() {
  return (
    <div className="nx-titlebar" data-tauri-drag-region>
      <div className="nx-titlebar-title" data-tauri-drag-region>
        NovaNexus
      </div>
      <div className="nx-titlebar-controls">
        <button className="nx-titlebar-btn" onClick={() => currentWindow()?.minimize()} aria-label="Minimieren">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button className="nx-titlebar-btn" onClick={() => currentWindow()?.toggleMaximize()} aria-label="Maximieren">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" />
          </svg>
        </button>
        <button className="nx-titlebar-btn nx-titlebar-close" onClick={() => currentWindow()?.close()} aria-label="Schließen">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
