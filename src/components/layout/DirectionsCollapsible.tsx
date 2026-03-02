import { useState, useEffect, useRef } from 'react';

interface DirectionsCollapsibleProps {
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function DirectionsCollapsible({
  children,
  defaultExpanded = true,
}: DirectionsCollapsibleProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const lastScrollY = useRef(0);
  const manualToggleRef = useRef(false);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      if (y > lastScrollY.current && y > 80 && !manualToggleRef.current) {
        setExpanded(false);
      }
      manualToggleRef.current = false;
      lastScrollY.current = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleToggle = () => {
    manualToggleRef.current = true;
    setExpanded((prev) => !prev);
  };

  return (
    <section
      className="directions-collapsible"
      aria-label="Directions"
    >
      <button
        type="button"
        className="directions-collapsible-trigger"
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-controls="directions-content"
        id="directions-trigger"
      >
        <span className="directions-collapsible-label">Directions</span>
        <svg
          className={`directions-collapsible-chevron${expanded ? ' directions-collapsible-chevron--open' : ''}`}
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        id="directions-content"
        className="directions-collapsible-content"
        hidden={!expanded}
        role="region"
        aria-labelledby="directions-trigger"
      >
        <div className="directions-collapsible-inner">
          {children}
        </div>
      </div>
    </section>
  );
}
