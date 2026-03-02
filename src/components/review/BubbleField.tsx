import { useRef, useCallback } from 'react';
import { Bubble } from './Bubble';

interface BubbleFieldProps {
  questionKey: string;
  choices: string[];
  answerIndex: number;
  answered: boolean;
  selectedIndex: number | null;
  onAnswer: (index: number) => void;
  hoveredIndex: number | null;
  poppedIndex: number | null;
  /** Use wider spacing for modes that need more separation (e.g. eye tracking). */
  spread?: boolean;
  /** Lock bubbles in a fixed horizontal row (no float animation). */
  fixed?: boolean;
}

interface PositionEntry {
  left: string;
  top?: string;
  motionDelay: number;
}

const POSITIONS: PositionEntry[] = [
  { left: '10%', motionDelay: 0 },
  { left: '35%', motionDelay: 0.3 },
  { left: '58%', motionDelay: 0.15 },
  { left: '82%', motionDelay: 0.45 },
];

const POSITIONS_SPREAD: PositionEntry[] = [
  { left: '5%', motionDelay: 0 },
  { left: '28%', motionDelay: 0.3 },
  { left: '52%', motionDelay: 0.15 },
  { left: '76%', motionDelay: 0.45 },
];

const POSITIONS_FIXED: PositionEntry[] = [
  { left: '5%',  top: '35%', motionDelay: 0 },
  { left: '28%', top: '35%', motionDelay: 0.1 },
  { left: '52%', top: '35%', motionDelay: 0.2 },
  { left: '76%', top: '35%', motionDelay: 0.3 },
];

export function BubbleField({
  questionKey,
  choices,
  answerIndex,
  answered,
  selectedIndex,
  onAnswer,
  hoveredIndex,
  poppedIndex,
  spread = false,
  fixed = false,
}: BubbleFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const pos = fixed ? POSITIONS_FIXED : spread ? POSITIONS_SPREAD : POSITIONS;

  const getBubbleState = useCallback(
    (index: number): 'default' | 'hovered' | 'correct' | 'incorrect' => {
      if (answered) {
        if (index === answerIndex) return 'correct';
        if (index === selectedIndex) return 'incorrect';
        return 'default';
      }
      if (hoveredIndex === index) return 'hovered';
      return 'default';
    },
    [answered, answerIndex, selectedIndex, hoveredIndex],
  );

  return (
    <div
      className={`bubble-field${fixed ? ' bubble-field--fixed' : ''}`}
      ref={fieldRef}
      data-bubble-field
    >
      {choices.map((choice, i) => (
        <Bubble
          key={`${questionKey}-${i}`}
          id={i}
          text={choice}
          state={getBubbleState(i)}
          popped={poppedIndex === i}
          motionDelay={pos[i].motionDelay}
          disabled={answered}
          onClick={() => onAnswer(i)}
          fixed={fixed}
          style={fixed ? undefined : {
            left: pos[i].left,
            ...(pos[i].top ? { top: pos[i].top } : {}),
          }}
        />
      ))}
    </div>
  );
}
