import { motion, type Variants } from 'framer-motion';

interface TokenPillProps {
  text: string;
  index: number;
  state: 'default' | 'hovered' | 'selected' | 'used';
  disabled: boolean;
  onClick: () => void;
  motionDelay?: number;
}

const variants: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { delay, duration: 0.3, ease: 'easeOut' },
  }),
  used: {
    opacity: 0.3,
    scale: 0.92,
    transition: { duration: 0.2 },
  },
};

export function TokenPill({
  text,
  state,
  disabled,
  onClick,
  motionDelay = 0,
}: TokenPillProps) {
  const className = `token-pill token-pill--${state}`;

  return (
    <motion.button
      className={className}
      disabled={disabled || state === 'used'}
      onClick={onClick}
      variants={variants}
      initial="hidden"
      animate={state === 'used' ? 'used' : 'visible'}
      custom={motionDelay}
      whileHover={!disabled && state !== 'used' ? { scale: 1.08, transition: { duration: 0.12 } } : undefined}
      whileTap={!disabled && state !== 'used' ? { scale: 0.93 } : undefined}
    >
      <span className="token-pill-text">{text}</span>
    </motion.button>
  );
}
