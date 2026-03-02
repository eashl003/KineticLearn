import { useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import problemsData from '../data/problems.json';
import { ProblemPrompt } from '../components/problems/ProblemPrompt';
import { SketchCanvas } from '../components/problems/SketchCanvas';
import type { SketchCanvasHandle } from '../components/problems/SketchCanvas';
import { SpeechPanel } from '../components/problems/SpeechPanel';
import { CodeEditor } from '../components/problems/CodeEditor';
import { EvidencePanel } from '../components/problems/EvidencePanel';
import { FeedbackPanel } from '../components/problems/FeedbackPanel';
import { isSpeechSupported } from '../lib/speech/speechRecognition';

interface Problem {
  id: string;
  title: string;
  tags: string[];
  prompt: string;
  constraints: string[];
  expectedPatterns: string[];
  solution?: string;
  solutionExplanation?: string;
}

const problems: Problem[] = problemsData.problems;
const speechAvailable = isSpeechSupported();

export function ProblemSolvePage() {
  const { id } = useParams<{ id: string }>();
  const problem = problems.find((p) => p.id === id);

  const [transcript, setTranscript] = useState('');
  const [code, setCode] = useState('');
  const [showSolution, setShowSolution] = useState(false);
  const sketchRef = useRef<SketchCanvasHandle>(null);

  const effectiveTranscript = transcript;

  const getSketchPng = useCallback(() => {
    return sketchRef.current?.getPngDataUrl() ?? '';
  }, []);

  const getStrokes = useCallback(() => {
    return sketchRef.current?.getStrokes() ?? [];
  }, []);

  if (!problem) {
    return (
      <div className="page">
        <h1>Problem not found</h1>
        <Link to="/problems" className="btn btn-outline">
          Back to Problems
        </Link>
      </div>
    );
  }

  return (
    <div className="page solve-page">
      <Link to="/problems" className="back-link">
        &larr; Back to Problems
      </Link>

      <ProblemPrompt
        title={problem.title}
        prompt={problem.prompt}
        constraints={problem.constraints}
        tags={problem.tags}
      />

      <div className="solve-layout">
        <div className="solve-left">
          <SketchCanvas ref={sketchRef} />
          {speechAvailable ? (
            <SpeechPanel
              value={transcript}
              onTranscriptChange={setTranscript}
            />
          ) : (
            <SpeechPanel
              value={transcript}
              onTranscriptChange={setTranscript}
            />
          )}
        </div>

        <div className="solve-right">
          <CodeEditor value={code} onChange={setCode} language="python" />
          <EvidencePanel
            problemId={problem.id}
            problemTitle={problem.title}
            transcript={effectiveTranscript}
            strokes={getStrokes()}
            sketchPngDataUrl={getSketchPng()}
          />
          <FeedbackPanel
            transcript={effectiveTranscript}
            expectedPatterns={problem.expectedPatterns}
            problemPrompt={problem.prompt}
          />
          {problem.solution != null && (
            <div className="solution-panel">
              <div className="solution-header">
                <span className="solution-label">Solution</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setShowSolution((s) => !s)}
                >
                  {showSolution ? 'Hide solution' : 'Show solution'}
                </button>
              </div>
              {showSolution && (
                <div className="solution-body">
                  {problem.solutionExplanation && (
                    <p className="solution-explanation">
                      {problem.solutionExplanation}
                    </p>
                  )}
                  <pre className="solution-code">{problem.solution}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
