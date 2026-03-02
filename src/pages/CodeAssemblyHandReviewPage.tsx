import { CodeAssemblyContainer } from '../components/review/CodeAssemblyContainer';
import { DirectionsCollapsible } from '../components/layout/DirectionsCollapsible';

export function CodeAssemblyHandReviewPage() {
  return (
    <div className="page">
      <DirectionsCollapsible defaultExpanded>
        <p><strong>Code Assembly.</strong> Build correct Python code from token fragments.</p>
        <ul>
          <li><strong>Point</strong> at the token you want to add with your index finger, or click/tap.</li>
          <li>Tokens are placed in order to form valid code.</li>
          <li>Select a topic above and click Start to begin.</li>
          <li>Click <strong>Add new questions</strong> to create custom question sets for any topic you want to study. These are saved to your current session.</li>
        </ul>
      </DirectionsCollapsible>
      <CodeAssemblyContainer />
    </div>
  );
}
