interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export function NotesPanel({ value, onChange }: NotesPanelProps) {
  return (
    <div className="notes-panel">
      <div className="notes-toolbar">
        <span className="notes-label">Typed Notes</span>
        <span className="notes-hint">
          Speech recognition is not available in this browser.
        </span>
      </div>
      <textarea
        className="notes-textarea"
        placeholder="Type your reasoning here..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
      />
    </div>
  );
}
