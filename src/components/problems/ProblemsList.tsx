import { Link } from 'react-router-dom';
import problemsData from '../../data/problems.json';

interface Problem {
  id: string;
  title: string;
  tags: string[];
  prompt: string;
}

const problems: Problem[] = problemsData.problems;

export function ProblemsList() {
  return (
    <div className="problems-list">
      {problems.map((p) => (
        <Link key={p.id} to={`/problems/${p.id}`} className="problem-card">
          <h3>{p.title}</h3>
          <div className="problem-tags">
            {p.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
          <p className="problem-preview">
            {p.prompt.length > 120 ? p.prompt.slice(0, 120) + '...' : p.prompt}
          </p>
        </Link>
      ))}
    </div>
  );
}
