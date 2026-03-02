import type { Stroke } from './SketchCanvas';

interface EvidencePanelProps {
  problemId: string;
  problemTitle: string;
  transcript: string;
  strokes: Stroke[];
  sketchPngDataUrl: string;
}

function downloadJson(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function EvidencePanel({
  problemId,
  problemTitle,
  transcript,
  strokes,
  sketchPngDataUrl,
}: EvidencePanelProps) {
  const handleExport = () => {
    const bundle = {
      problemId,
      problemTitle,
      createdAt: new Date().toISOString(),
      transcript,
      strokes,
      sketchPngDataUrl,
    };
    downloadJson(bundle, `evidence-${problemId}-${Date.now()}.json`);
  };

  const hasContent = transcript.trim().length > 0 || strokes.length > 0;

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <span className="evidence-label">Evidence</span>
        <button
          className="btn btn-sm"
          onClick={handleExport}
          disabled={!hasContent}
        >
          Export Bundle
        </button>
      </div>

      <div className="evidence-body">
        <div className="evidence-section">
          <h4>Problem</h4>
          <p>{problemTitle}</p>
        </div>

        {transcript.trim() && (
          <div className="evidence-section">
            <h4>Transcript / Notes</h4>
            <p className="evidence-transcript">{transcript}</p>
          </div>
        )}

        {sketchPngDataUrl && strokes.length > 0 && (
          <div className="evidence-section">
            <h4>Sketch</h4>
            <img
              src={sketchPngDataUrl}
              alt="Sketch preview"
              className="evidence-sketch-preview"
            />
          </div>
        )}

        {!hasContent && (
          <p className="evidence-empty">
            Start sketching or talking to build your evidence...
          </p>
        )}
      </div>
    </div>
  );
}
