interface PatternRule {
  pattern: string;
  keywords: RegExp;
  found: string;
  missing: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    pattern: 'hashmap',
    keywords: /\b(dict|hash\s?map|hash\s?table|map|complement|lookup)\b/i,
    found: 'Good: you mentioned a hashmap-based approach.',
    missing:
      'Consider using a hashmap (dict) for O(1) lookups — e.g., store complements as you iterate.',
  },
  {
    pattern: 'complement',
    keywords: /\b(complement|target\s*-|difference)\b/i,
    found: 'Good: you identified the complement pattern.',
    missing:
      'Think about the complement: for each element, check if (target - element) exists in your map.',
  },
  {
    pattern: 'stack',
    keywords: /\b(stack|push|pop|lifo)\b/i,
    found: 'Good: you recognized this is a stack problem.',
    missing: 'A stack (LIFO) is a natural fit for matching/nesting problems.',
  },
  {
    pattern: 'matching',
    keywords: /\b(match|pair|closing|opening|bracket)\b/i,
    found: 'Good: you discussed matching pairs.',
    missing:
      'Think about how to match each closing bracket with its corresponding opening bracket.',
  },
  {
    pattern: 'two-pointers',
    keywords: /\b(two\s*pointer|left.*right|pointer|merge)\b/i,
    found: 'Good: you mentioned a two-pointer approach.',
    missing:
      'Consider using two pointers — one for each array — to merge in O(n+m) time.',
  },
  {
    pattern: 'in-place',
    keywords: /\b(in[\s-]?place|backward|end|reverse)\b/i,
    found: 'Good: you considered an in-place strategy.',
    missing:
      'Try filling from the end of the array to avoid shifting elements.',
  },
  {
    pattern: 'kadane',
    keywords: /\b(kadane|running\s*sum|current\s*sum|max\s*ending|subarray\s*sum)\b/i,
    found: "Good: you referenced Kadane's algorithm or a running-sum approach.",
    missing:
      "Look into Kadane's algorithm: track the max subarray sum ending at each position.",
  },
  {
    pattern: 'dynamic-programming',
    keywords: /\b(dp|dynamic\s*programming|memo|subproblem|optimal\s*substructure)\b/i,
    found: 'Good: you identified this as a dynamic programming problem.',
    missing:
      'This problem has optimal substructure — consider a DP or greedy approach.',
  },
  {
    pattern: 'iterative',
    keywords: /\b(iterative|while\s*loop|prev|curr|next)\b/i,
    found: 'Good: you outlined an iterative approach.',
    missing:
      'An iterative approach with prev/curr/next pointers is efficient for this problem.',
  },
  {
    pattern: 'prev-curr-next',
    keywords: /\b(prev|previous|curr|current|next|temp)\b/i,
    found: 'Good: you mentioned tracking previous/current/next nodes.',
    missing:
      'Use three pointers (prev, curr, next) to reverse links one at a time.',
  },
];

const GENERIC_WARNINGS = [
  {
    trigger: /\bnested\s*(for\s*)?loop\b/i,
    message:
      'Warning: nested loops often mean O(n^2). Can you reduce to O(n) with a hashmap or two pointers?',
  },
  {
    trigger: /\bsort\b/i,
    message:
      'Note: sorting costs O(n log n). Sometimes acceptable, but check if an O(n) approach exists.',
  },
  {
    trigger: /\bbrute\s*force\b/i,
    message:
      'You mentioned brute force — that\'s a fine starting point. Now optimize!',
  },
];

export function evaluate(
  transcript: string,
  expectedPatterns: string[],
): string[] {
  const bullets: string[] = [];
  const text = transcript.toLowerCase();

  if (!text.trim()) {
    return ['Start explaining your approach to get feedback.'];
  }

  for (const ep of expectedPatterns) {
    const rule = PATTERN_RULES.find((r) => r.pattern === ep);
    if (!rule) continue;
    if (rule.keywords.test(text)) {
      bullets.push(rule.found);
    } else {
      bullets.push(rule.missing);
    }
  }

  for (const w of GENERIC_WARNINGS) {
    if (w.trigger.test(text)) {
      bullets.push(w.message);
    }
  }

  if (bullets.length === 0) {
    bullets.push(
      'Keep going — try to articulate the data structure and algorithm you would use.',
    );
  }

  return bullets.slice(0, 5);
}
