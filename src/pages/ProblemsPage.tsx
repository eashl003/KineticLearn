import { ProblemsList } from '../components/problems/ProblemsList';

export function ProblemsPage() {
  return (
    <div className="page">
      <h1>Coding Problems</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Pick a problem, sketch your approach, and think out loud.
      </p>
      <ProblemsList />
    </div>
  );
}
