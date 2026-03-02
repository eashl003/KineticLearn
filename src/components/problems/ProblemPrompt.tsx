interface ProblemPromptProps {
  title: string;
  prompt: string;
  constraints: string[];
  tags: string[];
}

export function ProblemPrompt({
  title,
  prompt,
  constraints,
  tags,
}: ProblemPromptProps) {
  return (
    <div className="problem-prompt">
      <h2>{title}</h2>
      <div className="problem-tags">
        {tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <p className="problem-prompt-text">{prompt}</p>
      {constraints.length > 0 && (
        <div className="problem-constraints">
          <h4>Constraints</h4>
          <ul>
            {constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
