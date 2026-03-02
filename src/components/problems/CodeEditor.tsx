import { useRef, useCallback, useState, useEffect } from 'react';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language?: string;
}

export function CodeEditor({
  value,
  onChange,
  language = 'python',
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lineCount, setLineCount] = useState(1);

  useEffect(() => {
    const lines = value.split('\n').length;
    setLineCount(Math.max(lines, 1));
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = textareaRef.current;
      if (!ta) return;

      if (e.key === 'Tab') {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const newValue = value.substring(0, start) + '    ' + value.substring(end);
        onChange(newValue);
        requestAnimationFrame(() => {
          ta.selectionStart = ta.selectionEnd = start + 4;
        });
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const start = ta.selectionStart;
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const currentLine = value.substring(lineStart, start);
        const indent = currentLine.match(/^(\s*)/)?.[1] || '';
        const newValue =
          value.substring(0, start) + '\n' + indent + value.substring(ta.selectionEnd);
        onChange(newValue);
        requestAnimationFrame(() => {
          const pos = start + 1 + indent.length;
          ta.selectionStart = ta.selectionEnd = pos;
        });
      }
    },
    [value, onChange],
  );

  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    const gutter = ta?.previousElementSibling as HTMLElement | null;
    if (ta && gutter) {
      gutter.scrollTop = ta.scrollTop;
    }
  }, []);

  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className="code-editor-wrapper">
      <div className="code-editor-toolbar">
        <span className="code-editor-label">Code</span>
        <span className="code-editor-lang">{language}</span>
      </div>
      <div className="code-editor-container">
        <div className="code-editor-gutter" aria-hidden>
          {lineNumbers.map((n) => (
            <span key={n} className="code-editor-line-num">
              {n}
            </span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="code-editor-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="# Write your solution here..."
        />
      </div>
    </div>
  );
}
