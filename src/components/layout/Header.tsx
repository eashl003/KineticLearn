import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { clearAllData } from '../../lib/storage/localStore';
import { useSupportModal } from '../../contexts/SupportModalContext';
import { SupportOpenSourceModal } from '../modals/SupportOpenSourceModal';

export function Header() {
  const [hidden, setHidden] = useState(false);
  const { isOpen: supportModalOpen, closeModal: closeSupportModal, openModal: openSupportModal } = useSupportModal();
  const lastScrollY = useRef(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (y <= 10) {
        setHidden(false);
      } else if (y > lastScrollY.current) {
        setHidden(true);
      } else {
        setHidden(false);
      }
      lastScrollY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleClear = () => {
    if (window.confirm('Clear all saved progress?')) {
      clearAllData();
      window.location.reload();
    }
  };

  return (
    <header className={`header${hidden ? ' header--hidden' : ''}`}>
      <Link to="/" className="header-title">KineticLearn</Link>
      <nav className="header-nav">
        <Link to="/review" className="header-nav-icon tool-pill" title="Review (hand gestures)">
          <span className="header-nav-emoji" aria-hidden>👋</span>
        </Link>
        <Link to="/review-eye" className="header-nav-icon tool-pill" title="Review (eye tracking)">
          <span className="header-nav-emoji" aria-hidden>👁️</span>
        </Link>
        <Link to="/code-assembly" className="header-nav-icon tool-pill" title="Code Assembly (hand gestures)">
          <span className="header-nav-emoji" aria-hidden>🧩</span>
        </Link>
        <Link to="/problems" className="header-nav-icon tool-pill" title="Problems">
          <span className="header-nav-emoji" aria-hidden>📝</span>
        </Link>
        <button
          type="button"
          className="header-nav-icon tool-pill header-nav-support"
          title="Support Open Source"
          onClick={openSupportModal}
        >
          <span className="header-nav-emoji" aria-hidden>☕</span>
          <span className="header-nav-support-label">Support Open Source</span>
        </button>
        <button type="button" className="header-clear clear-btn" onClick={handleClear}>
          Clear Data
        </button>
      </nav>
      <SupportOpenSourceModal
        open={supportModalOpen}
        onClose={closeSupportModal}
      />
    </header>
  );
}
