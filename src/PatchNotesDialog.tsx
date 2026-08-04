import { PATCH_NOTES } from "./patchNotes";

type Props = {
  onClose: () => void;
};

export default function PatchNotesDialog({ onClose }: Props) {
  return (
    <div className="nx-modal-overlay" onClick={onClose}>
      <div className="nx-modal nx-patchnotes-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Was ist neu</h2>
        <div className="nx-patchnotes-list">
          {PATCH_NOTES.map((entry) => (
            <div key={entry.version} className="nx-patchnotes-entry">
              <div className="nx-patchnotes-entry-head">
                <span className="nx-patchnotes-version">v{entry.version}</span>
                <span className="nx-patchnotes-date">{entry.date}</span>
              </div>
              <ul>
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="nx-modal-actions">
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
