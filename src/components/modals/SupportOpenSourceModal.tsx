import { createPortal } from 'react-dom';
import venmoQrUrl from '../../assets/support/venmo_qr.png';

interface SupportOpenSourceModalProps {
  open: boolean;
  onClose: () => void;
}

export function SupportOpenSourceModal({ open, onClose }: SupportOpenSourceModalProps) {
  if (!open) return null;

  const modalContent = (
    <div
      className="review-modal-backdrop support-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-subtitle"
    >
      <div className="review-modal support-modal support-modal--simple">
        <button
          type="button"
          className="support-modal-close-icon"
          onClick={onClose}
          aria-label="Close"
        >
          <span aria-hidden>×</span>
        </button>
        <div className="support-modal-content">
          <div className="support-modal-title-block">
            <p id="support-modal-subtitle" className="support-modal-witty">
              <span className="support-modal-witty-line1">Nailed the interview? Landed the offer?</span>
              <span className="support-modal-witty-accent" aria-hidden> ☕</span>
              <br />
              <span className="support-modal-witty-line2">I hope to keep KineticLearn free and keep evolving the platform, so consider buying me a coffee. It&apos;s much appreciated!</span>
            </p>
          </div>
          <div className="support-modal-qr-wrap">
            <img
              src={venmoQrUrl}
              alt="Venmo QR code for donations"
              className="support-modal-qr"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
