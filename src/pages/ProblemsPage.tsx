import { ProblemsList } from '../components/problems/ProblemsList';
import { DirectionsCollapsible } from '../components/layout/DirectionsCollapsible';

export function ProblemsPage() {
  return (
    <div className="page">
      <DirectionsCollapsible defaultExpanded>
        <p><strong>Coding Problems.</strong> Practice solving real coding challenges.</p>
        <ul>
          <li>Pick a problem from the list below.</li>
          <li>Sketch your approach on the canvas and think out loud (or type).</li>
          <li>Write code in the editor and get AI feedback on your approach.</li>
          <li>Export your sketch and transcript for review.</li>
        </ul>
      </DirectionsCollapsible>
      <h1>Coding Problems</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        Pick a problem, sketch your approach, and think out loud.
      </p>
      <ProblemsList />
    </div>
  );
}
