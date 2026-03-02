const PREFIX = 'kineticlearn:';

export interface ReviewProgress {
  currentIndex: number;
  score: number;
  answeredIds: string[];
  /** Id of the question set this progress belongs to; if missing or mismatched, progress is ignored. */
  questionSetId?: string;
}

export interface StoredReviewQuestionSet {
  id: string;
  name: string;
  description: string;
  schemaVersion: number;
  questions: Array<{
    id: string;
    topic: string;
    question: string;
    choices: string[];
    answerIndex: number;
    explanation: string;
  }>;
}

export function saveReviewProgress(progress: ReviewProgress): void {
  try {
    localStorage.setItem(
      PREFIX + 'review-progress',
      JSON.stringify(progress),
    );
  } catch {
    // localStorage might be full or unavailable
  }
}

export function loadReviewProgress(): ReviewProgress | null {
  try {
    const raw = localStorage.getItem(PREFIX + 'review-progress');
    if (!raw) return null;
    return JSON.parse(raw) as ReviewProgress;
  } catch {
    return null;
  }
}

export function clearReviewProgress(): void {
  try {
    localStorage.removeItem(PREFIX + 'review-progress');
  } catch {
    // ignore
  }
}

export function saveCustomReviewQuestionSets(
  sets: StoredReviewQuestionSet[],
): void {
  try {
    localStorage.setItem(PREFIX + 'review-question-sets', JSON.stringify(sets));
  } catch {
    // localStorage might be full or unavailable
  }
}

export function loadCustomReviewQuestionSets(): StoredReviewQuestionSet[] {
  try {
    const raw = localStorage.getItem(PREFIX + 'review-question-sets');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredReviewQuestionSet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActiveReviewQuestionSetId(setId: string): void {
  try {
    localStorage.setItem(PREFIX + 'review-active-question-set-id', setId);
  } catch {
    // localStorage might be full or unavailable
  }
}

export function loadActiveReviewQuestionSetId(): string | null {
  try {
    return localStorage.getItem(PREFIX + 'review-active-question-set-id');
  } catch {
    return null;
  }
}

export interface StoredAssemblyQuestionSet {
  id: string;
  name: string;
  description: string;
  schemaVersion: number;
  questions: Array<{
    id: string;
    question: string;
    tokens: string[];
    validAnswers: string[][];
    explanation: string;
  }>;
}

export function saveCustomAssemblySets(sets: StoredAssemblyQuestionSet[]): void {
  try {
    localStorage.setItem(PREFIX + 'assembly-question-sets', JSON.stringify(sets));
  } catch {
    // ignore
  }
}

export function loadCustomAssemblySets(): StoredAssemblyQuestionSet[] {
  try {
    const raw = localStorage.getItem(PREFIX + 'assembly-question-sets');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredAssemblyQuestionSet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveActiveAssemblySetId(setId: string): void {
  try {
    localStorage.setItem(PREFIX + 'assembly-active-set-id', setId);
  } catch {
    // ignore
  }
}

export function loadActiveAssemblySetId(): string | null {
  try {
    return localStorage.getItem(PREFIX + 'assembly-active-set-id');
  } catch {
    return null;
  }
}

export function clearAllData(): void {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(PREFIX),
    );
    for (const k of keys) {
      localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
