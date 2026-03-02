import { motion, type Variants } from 'framer-motion';

interface BubbleProps {
  id: number;
  text: string;
  state: 'default' | 'hovered' | 'correct' | 'incorrect';
  popped?: boolean;
  motionDelay?: number;
  disabled: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  /** When true the bubble fades in at its CSS position and stays put. */
  fixed?: boolean;
}

const floatVariants: Variants = {
  hidden: {
    y: -100,
    opacity: 0,
    scale: 0.4,
    rotate: -6,
  },
  float: (delay: number) => ({
    y: [0, 20, 40, 80, 130, 200, 260],
    opacity: [0, 1, 1, 1, 1, 0.95, 0.85],
    scale: [0.4, 1.08, 1, 1.02, 1, 0.98, 1],
    rotate: [-6, 3, -2, 1, -1, 0.5, 0],
    transition: {
      delay,
      duration: 8,
      ease: 'easeInOut',
      times: [0, 0.08, 0.15, 0.3, 0.5, 0.75, 1],
    },
  }),
  fixed: (delay: number) => ({
    y: 0,
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: { delay, duration: 0.4, ease: 'easeOut' },
  }),
  correct: {
    scale: [1, 1.15, 1.05],
    transition: { duration: 0.4, ease: 'easeOut' },
  },
  incorrect: {
    x: [0, -8, 8, -5, 5, 0],
    transition: { duration: 0.45 },
  },
  popped: {
    scale: [1, 1.35, 0],
    opacity: [1, 1, 0],
    rotate: [0, 12, -15],
    transition: { duration: 0.45, ease: 'easeOut' },
  },
};

function getAnimateState(
  state: string,
  popped: boolean,
  fixed: boolean,
): string {
  if (popped) return 'popped';
  if (state === 'correct') return 'correct';
  if (state === 'incorrect') return 'incorrect';
  return fixed ? 'fixed' : 'float';
}

export function Bubble({
  text,
  state,
  popped = false,
  motionDelay = 0,
  disabled,
  onClick,
  style,
  fixed = false,
}: BubbleProps) {
  return (
    <motion.button
      className={`bubble bubble--${state} ${popped ? 'bubble--popped' : ''}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
      variants={floatVariants}
      initial="hidden"
      animate={getAnimateState(state, popped, fixed)}
      custom={motionDelay}
      whileHover={!disabled ? { scale: 1.1, transition: { duration: 0.15 } } : undefined}
      whileTap={!disabled ? { scale: 0.92 } : undefined}
    >
      <span className="bubble-text">{text}</span>
    </motion.button>
  );
}
