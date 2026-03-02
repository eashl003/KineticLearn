import { ReviewContainer } from '../components/review/ReviewContainer';
import { DirectionsCollapsible } from '../components/layout/DirectionsCollapsible';

export function ReviewModePage() {
  return (
    <div className="page">
      <DirectionsCollapsible defaultExpanded>
        <p><strong>Pop the bubble!</strong> Use hand gestures or click/tap to answer Python questions.</p>
        <ul>
          <li><strong>Point</strong> at the correct bubble with your index finger to select.</li>
          <li><strong>Swipe</strong> your hand left or right after answering to go to the next question.</li>
          <li>Use click or tap if the webcam is unavailable.</li>
          <li>Click <strong>Add new questions</strong> to create custom question sets for any topic you want to study. These are saved to your current session.</li>
        </ul>
      </DirectionsCollapsible>
      <ReviewContainer />
    </div>
  );
}
