import { Link } from 'react-router-dom';
import { useSupportModal } from '../contexts/SupportModalContext';

export function HomePage() {
  const { openModal: openSupportModal } = useSupportModal();

  return (
    <div className="home">
      <h1>Redefining the web learning experience with WebAI</h1>
      <p className="home-subtitle">Open Source and Free Platform</p>
      <button
        type="button"
        className="home-donate-cta"
        onClick={openSupportModal}
      >
        Consider donating ☕
      </button>
      <div className="home-cards">
        <Link to="/review" className="home-card">
          <h2>Review Mode</h2>
          <p>Pop the bubble! Answer Python questions using hand gestures or click/tap.</p>
        </Link>
        <Link to="/review-eye" className="home-card">
          <h2>Review Mode (Eye Tracking)</h2>
          <p>Same bubble quiz — select answers with gaze direction and blink detection.</p>
        </Link>
        <Link to="/code-assembly" className="home-card">
          <h2>Code Assembly</h2>
          <p>Assemble Python code from token fragments using hand gestures or click/tap.</p>
        </Link>
        <Link to="/problems" className="home-card">
          <h2>Problems Mode</h2>
          <p>Solve coding problems with sketch + speech recognition.</p>
        </Link>
      </div>
      <div className="home-more">
        <span className="home-more-arrow" aria-hidden>↓</span>
        <p className="home-more-text">
          More coming soon! Contributions welcome, star the repo or open a PR.
        </p>
      </div>
    </div>
  );
}
