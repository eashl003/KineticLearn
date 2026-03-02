import { useState, useRef, useCallback, useEffect } from 'react';
import { createRecognizer } from '../../lib/speech/speechRecognition';

interface SpeechPanelProps {
  value: string;
  onTranscriptChange: (transcript: string) => void;
}

export function SpeechPanel({ value, onTranscriptChange }: SpeechPanelProps) {
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognizerRef = useRef<ReturnType<typeof createRecognizer> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      recognizerRef.current?.abort();
    };
  }, []);

  const handleResult = useCallback(
    (text: string) => {
      setLiveTranscript(text);
      onTranscriptChange(text);
    },
    [onTranscriptChange],
  );

  const handleEnd = useCallback(() => {
    setListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (listening) {
      recognizerRef.current?.stop();
      setListening(false);
    } else {
      const rec = createRecognizer(handleResult, handleEnd);
      recognizerRef.current = rec;
      rec.start();
      setListening(true);
    }
  }, [listening, handleResult, handleEnd]);

  const displayValue = listening ? liveTranscript : value;

  return (
    <div className="speech-panel">
      <div className="speech-toolbar">
        <span className="speech-label">Think Out Loud</span>
        <button
          className={`btn btn-sm ${listening ? 'btn-listening' : 'btn-outline'}`}
          onClick={toggleListening}
        >
          {listening ? 'Stop' : 'Start'} Recording
        </button>
      </div>
      {listening && (
        <div className="speech-indicator">Listening...</div>
      )}
      <textarea
        className="speech-transcript speech-transcript--editable"
        placeholder="Type or speak your reasoning here..."
        value={displayValue}
        onChange={(e) => onTranscriptChange(e.target.value)}
        onBlur={() => setLiveTranscript(value)}
        rows={6}
        disabled={listening}
      />
    </div>
  );
}
