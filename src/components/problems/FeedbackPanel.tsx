import { useState, useCallback, useRef, useEffect } from 'react';
import {
  initLLMEngine,
  streamChat,
  buildSystemPrompt,
} from '../../lib/evaluate/llm';
import type { ChatMessage } from '../../lib/evaluate/llm';
import type { MLCEngine, InitProgressReport } from '@mlc-ai/web-llm';

interface FeedbackPanelProps {
  transcript: string;
  expectedPatterns: string[];
  problemPrompt: string;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function FeedbackPanel({
  transcript,
  expectedPatterns,
  problemPrompt,
}: FeedbackPanelProps) {
  const [aiReady, setAiReady] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [followUp, setFollowUp] = useState('');

  const engineRef = useRef<MLCEngine | null>(null);
  const historyRef = useRef<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  // Auto-init the AI model on mount
  useEffect(() => {
    if (engineRef.current || aiLoading) return;

    if (!(navigator as any).gpu) {
      setAiError(
        'WebGPU is not supported in this browser. Use Chrome or Edge for AI feedback.',
      );
      return;
    }

    let cancelled = false;
    setAiLoading(true);

    initLLMEngine((progress: InitProgressReport) => {
      if (!cancelled) setAiProgress(progress.text);
    })
      .then((engine) => {
        if (!cancelled) {
          engineRef.current = engine;
          setAiReady(true);
        }
      })
      .catch((err) => {
        console.error('Failed to load AI model:', err);
        if (!cancelled) {
          setAiError('Failed to load AI model. Refresh and try again.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAiLoading(false);
          setAiProgress('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!engineRef.current || generating) return;

      const isFirst = historyRef.current.length === 0;

      if (isFirst) {
        historyRef.current = [
          {
            role: 'system',
            content: buildSystemPrompt(problemPrompt, expectedPatterns),
          },
        ];
      }

      const userContent = isFirst
        ? `Here is my approach to the problem:\n${transcript}\n\nPlease give me feedback.`
        : userText;

      historyRef.current.push({ role: 'user', content: userContent });

      setMessages((prev) => [
        ...prev,
        { role: 'user', content: isFirst ? 'Give me feedback on my approach' : userText },
      ]);
      setGenerating(true);
      setStreamText('');

      try {
        const finalText = await streamChat(
          engineRef.current,
          historyRef.current,
          (partial) => setStreamText(partial),
        );

        historyRef.current.push({ role: 'assistant', content: finalText });
        setMessages((prev) => [...prev, { role: 'assistant', content: finalText }]);
        setStreamText('');
      } catch (err) {
        console.error('AI generation failed:', err);
        const errMsg = 'Sorry, something went wrong. Try again.';
        setMessages((prev) => [...prev, { role: 'assistant', content: errMsg }]);
        setStreamText('');
      } finally {
        setGenerating(false);
      }
    },
    [generating, problemPrompt, expectedPatterns, transcript],
  );

  const handleGetFeedback = useCallback(() => {
    historyRef.current = [];
    setMessages([]);
    sendMessage('');
  }, [sendMessage]);

  const handleFollowUp = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = followUp.trim();
      if (!text) return;
      setFollowUp('');
      sendMessage(text);
    },
    [followUp, sendMessage],
  );

  return (
    <div className="feedback-panel">
      <div className="feedback-header">
        <span className="feedback-label">AI Feedback</span>
        <button
          className="btn btn-sm ai-btn-active"
          onClick={handleGetFeedback}
          disabled={!aiReady || generating}
        >
          {generating ? 'Generating...' : messages.length > 0 ? 'New Feedback' : 'Get AI Feedback'}
        </button>
      </div>

      {aiLoading && (
        <div className="ai-loading-status">
          <p className="status-loading">
            Loading AI model (downloads once, caches for next time)...
          </p>
          <p className="ai-progress-text">{aiProgress}</p>
        </div>
      )}

      {aiError && <p className="status-error">{aiError}</p>}

      {messages.length > 0 && (
        <div className="ai-chat-history">
          {messages.map((msg, i) => (
            <div key={i} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
              <span className="ai-chat-role">
                {msg.role === 'user' ? 'You' : 'AI Coach'}
              </span>
              <p className="ai-chat-content">{msg.content}</p>
            </div>
          ))}

          {generating && streamText && (
            <div className="ai-chat-msg ai-chat-msg--assistant">
              <span className="ai-chat-role">AI Coach</span>
              <p className="ai-chat-content">
                {streamText}
                <span className="ai-cursor" />
              </p>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      )}

      {messages.length === 0 && !aiLoading && !aiError && (
        <p className="feedback-placeholder">
          {aiReady
            ? 'Click "Get AI Feedback" after explaining your approach.'
            : 'AI model is initializing...'}
        </p>
      )}

      {aiReady && messages.length > 0 && !generating && (
        <form className="ai-followup-form" onSubmit={handleFollowUp}>
          <input
            type="text"
            className="ai-followup-input"
            placeholder="Ask a follow-up... e.g. 'Why enumerate?'"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
          <button type="submit" className="btn btn-sm ai-btn-active" disabled={!followUp.trim()}>
            Ask
          </button>
        </form>
      )}
    </div>
  );
}
