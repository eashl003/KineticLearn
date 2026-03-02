import { TokenPill } from './TokenPill';

interface TokenFieldProps {
  questionKey: string;
  tokens: string[];
  usedIndices: number[];
  hoveredIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function TokenField({
  questionKey,
  tokens,
  usedIndices,
  hoveredIndex,
  disabled,
  onSelect,
}: TokenFieldProps) {
  return (
    <div className="code-assembly-token-field" data-code-assembly-token-field>
      {tokens.map((token, i) => {
        const used = usedIndices.includes(i);
        const hovered = hoveredIndex === i && !used;
        const state = used ? 'used' : hovered ? 'hovered' : 'default';

        return (
          <TokenPill
            key={`${questionKey}-${i}`}
            text={token}
            index={i}
            state={state}
            disabled={disabled}
            onClick={() => onSelect(i)}
            motionDelay={i * 0.04}
          />
        );
      })}
    </div>
  );
}
