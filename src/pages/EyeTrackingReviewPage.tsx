import { EyeTrackingReviewContainer } from '../components/review/EyeTrackingReviewContainer';
import { DirectionsCollapsible } from '../components/layout/DirectionsCollapsible';

export function EyeTrackingReviewPage() {
  return (
    <div className="page">
      <DirectionsCollapsible defaultExpanded>
        <p><strong>Eye tracking mode.</strong> Same bubble quiz, controlled with your eyes.</p>
        <ul>
          <li><strong>Look</strong> at the bubble you want to select.</li>
          <li><strong>Blink</strong> to confirm your selection.</li>
          <li>Works best in a well-lit environment with the camera clearly showing your face.</li>
          <li>Click <strong>Add new questions</strong> to create custom question sets for any topic you want to study. These are saved to your current session.</li>
        </ul>
      </DirectionsCollapsible>
      <EyeTrackingReviewContainer />
    </div>
  );
}
