import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  initializeEyeTracking,
  startTracking,
  stopTracking,
  getCurrentGazeTarget,
  detectBlinkSelection,
  detectWink,
  cleanup as cleanupEyeTracking,
} from '../../lib/eye-tracking/eyeInteractionController';
import {
  builtInSets,
  getBuiltInSetById,
  TOPIC_LABELS,
  type ReviewQuestionSet as RegistryQuestionSet,
} from '../../data/questionRegistry';
import { BubbleField } from './BubbleField';
import { startCamera, stopCamera } from '../../lib/mediapipe/camera';
import { findClosestBubble } from '../../lib/mediapipe/coords';
import {
  saveReviewProgress,
  loadReviewProgress,
  clearReviewProgress,
  saveCustomReviewQuestionSets,
  loadCustomReviewQuestionSets,
  saveActiveReviewQuestionSetId,
  loadActiveReviewQuestionSetId,
  type StoredReviewQuestionSet,
} from '../../lib/storage/localStore';

interface Question {
  id: string;
  topic: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

interface ReviewQuestionSet extends Omit<RegistryQuestionSet, 'source'> {
  source: 'built-in' | 'custom';
}

function getQuestionCountForSetId(setId: string): number {
  const builtIn = getBuiltInSetById(setId);
  if (builtIn) return builtIn.questions.length;
  const custom = loadCustomReviewQuestionSets();
  const set = custom.find((s) => s.id === setId);
  return set && Array.isArray(set.questions) ? set.questions.length : (builtInSets[0]?.questions.length ?? 0);
}

const LOG = '[EyeTrackingReview]';

const REVIEW_FORMAT_PROMPT = `Topic: [Your topic you wish to study]
Description: [Optional: difficulty, focus, learner level]

You are creating a multiple-choice quiz set. Each question has exactly 4 choices and one correct answer.
Return ONLY valid JSON (no markdown, no explanation, no backticks).
Generate exactly 8 questions for the topic above.

Output this exact top-level structure:
{
  "schemaVersion": 1,
  "name": "string",
  "description": "string",
  "questions": [
    {
      "id": "string",
      "topic": "topic-slug",
      "question": "Your question text?",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 0,
      "explanation": "Why the correct answer is right."
    }
  ]
}

Hard requirements:
- "questions" must contain exactly 8 items.
- Each question must have exactly 4 choices.
- "answerIndex" must be 0–3 (index of the correct choice).
- All question "id" values must be unique strings.
- "topic" should be a short slug describing the category (e.g. "python-basics", "world-history").
- Fill "name" and "description" using the provided Topic/Description.
- Return one JSON object only.`;

function toCustomSetId(name: string): string {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `custom-${clean || 'set'}-${Date.now()}`;
}

function mapStoredToReviewSet(stored: StoredReviewQuestionSet): ReviewQuestionSet {
  return {
    ...stored,
    source: 'custom',
  };
}

function validateQuestionSetPayload(raw: string): {
  ok: true;
  data: Omit<StoredReviewQuestionSet, 'id'>;
} | { ok: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON format.'] };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['Top-level JSON must be an object.'] };
  }

  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const name = obj.name;
  const description = obj.description;
  const schemaVersion = obj.schemaVersion;
  const questions = obj.questions;

  if (typeof name !== 'string' || name.trim().length === 0) {
    errors.push('`name` is required and must be a non-empty string.');
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    errors.push('`description` is required and must be a non-empty string.');
  }
  if (schemaVersion != null && typeof schemaVersion !== 'number') {
    errors.push('`schemaVersion` must be a number when provided.');
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push('`questions` must be a non-empty array.');
  }

  const normalizedQuestions: Question[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(questions)) {
    questions.forEach((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`questions[${i}] must be an object.`);
        return;
      }

      const q = item as Record<string, unknown>;
      const id = q.id;
      const topic = q.topic;
      const question = q.question;
      const choices = q.choices;
      const answerIndex = q.answerIndex;
      const explanation = q.explanation;

      if (typeof id !== 'string' || id.trim().length === 0) {
        errors.push(`questions[${i}].id must be a non-empty string.`);
      } else if (seenIds.has(id)) {
        errors.push(`Duplicate question id "${id}" found.`);
      } else {
        seenIds.add(id);
      }
      if (typeof topic !== 'string' || topic.trim().length === 0) {
        errors.push(`questions[${i}].topic must be a non-empty string.`);
      }
      if (typeof question !== 'string' || question.trim().length === 0) {
        errors.push(`questions[${i}].question must be a non-empty string.`);
      }
      if (!Array.isArray(choices) || choices.length !== 4) {
        errors.push(`questions[${i}].choices must be an array of exactly 4 choices.`);
      } else if (choices.some((c) => typeof c !== 'string' || c.trim().length === 0)) {
        errors.push(`questions[${i}].choices must only contain non-empty strings.`);
      }
      if (
        typeof answerIndex !== 'number' ||
        !Number.isInteger(answerIndex) ||
        answerIndex < 0 ||
        answerIndex > 3
      ) {
        errors.push(
          `questions[${i}].answerIndex must be an integer from 0 to 3.`,
        );
      }
      if (typeof explanation !== 'string' || explanation.trim().length === 0) {
        errors.push(`questions[${i}].explanation must be a non-empty string.`);
      }

      if (
        typeof id === 'string' &&
        typeof topic === 'string' &&
        typeof question === 'string' &&
        Array.isArray(choices) &&
        choices.length === 4 &&
        typeof answerIndex === 'number' &&
        Number.isInteger(answerIndex) &&
        answerIndex >= 0 &&
        answerIndex < 4 &&
        typeof explanation === 'string'
      ) {
        normalizedQuestions.push({
          id,
          topic,
          question,
          choices: choices as string[],
          answerIndex,
          explanation,
        });
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      name: (name as string).trim(),
      description: (description as string).trim(),
      schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 1,
      questions: normalizedQuestions,
    },
  };
}

export function EyeTrackingReviewContainer() {
  const [customSets, setCustomSets] = useState<ReviewQuestionSet[]>(() =>
    loadCustomReviewQuestionSets()
      .filter((set) => Array.isArray(set.questions) && set.questions.length > 0)
      .map(mapStoredToReviewSet),
  );
  const [activeSetId, setActiveSetId] = useState<string>(
    () => loadActiveReviewQuestionSetId() ?? builtInSets[0].id,
  );
  const allSets = useMemo(
    () => [...(builtInSets as ReviewQuestionSet[]), ...customSets],
    [customSets],
  );
  const activeSet = useMemo(
    () => allSets.find((s) => s.id === activeSetId) ?? (builtInSets[0] as ReviewQuestionSet),
    [allSets, activeSetId],
  );
  const questions = activeSet.questions;

  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = loadReviewProgress();
    const activeId = loadActiveReviewQuestionSetId() ?? builtInSets[0].id;
    const useSaved = saved && saved.questionSetId === activeId;
    if (!useSaved) return 0;
    const count = getQuestionCountForSetId(activeId);
    return Math.min(Math.max(0, saved.currentIndex), Math.max(0, count - 1));
  });
  const [answered, setAnswered] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [score, setScore] = useState(() => {
    const saved = loadReviewProgress();
    const activeId = loadActiveReviewQuestionSetId() ?? builtInSets[0].id;
    return saved && saved.questionSetId === activeId ? saved.score : 0;
  });
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);
  const [answeredIds, setAnsweredIds] = useState<string[]>(() => {
    const saved = loadReviewProgress();
    const activeId = loadActiveReviewQuestionSetId() ?? builtInSets[0].id;
    return saved && saved.questionSetId === activeId ? saved.answeredIds ?? [] : [];
  });

  // Webcam / eye-tracking state
  const [webcamActive, setWebcamActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);
  const [resultBadge, setResultBadge] = useState<'CORRECT!' | 'WRONG!' | 'NEXT' | 'PREV' | null>(
    null,
  );
  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [newSetJson, setNewSetJson] = useState('');
  const [setValidationErrors, setSetValidationErrors] = useState<string[]>([]);

  const [formatCopied, setFormatCopied] = useState(false);

  // Refs — camera feeds FaceLandmarker; canvas shows eye data points
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRunningRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const gazeHoveredRef = useRef<number | null>(null);
  const answeredRef = useRef(false);
  const handleAnswerRef = useRef<(index: number) => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const popTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(questions.length - 1, 0)));
  const question = questions[safeIndex];

  const playPopAndShowResult = useCallback((index: number, isCorrect: boolean) => {
    setPoppedIndex(index);
    if (popTimerRef.current !== null) {
      window.clearTimeout(popTimerRef.current);
    }
    // Shorter pop timer so bubbles disappear faster
    popTimerRef.current = window.setTimeout(() => {
      setPoppedIndex(null);
      popTimerRef.current = null;
    }, 300);

    setResultBadge(isCorrect ? 'CORRECT!' : 'WRONG!');
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => {
      setResultBadge(null);
      successTimerRef.current = null;
    }, 1500);
  }, []);

  useEffect(() => {
    answeredRef.current = answered;
  }, [answered]);

  useEffect(() => {
    const toStore: StoredReviewQuestionSet[] = customSets.map((set) => ({
      id: set.id,
      name: set.name,
      description: set.description,
      schemaVersion: set.schemaVersion,
      questions: set.questions,
    }));
    saveCustomReviewQuestionSets(toStore);
  }, [customSets]);

  useEffect(() => {
    saveActiveReviewQuestionSetId(activeSet.id);
  }, [activeSet.id]);

  useEffect(() => {
    if (questions.length === 0) {
      setCurrentIndex(0);
      setAnswered(false);
      setSelectedIndex(null);
      return;
    }
    if (currentIndex >= questions.length) {
      setCurrentIndex(0);
      setAnswered(false);
      setSelectedIndex(null);
      setFinished(false);
    }
  }, [currentIndex, questions.length]);

  // ---------------------------------------------------------------------------
  // Eye-tracking boot: init controller, start camera (for future FaceMesh),
  // then run a gaze polling loop that maps gaze targets to bubble hover +
  // blink-based selection.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const bootStart = performance.now();

    console.log(`${LOG} Boot sequence starting...`);

    async function boot() {
      try {
        console.log(`${LOG} Step 1/3: Initializing eye tracking controller...`);
        await initializeEyeTracking();
        if (cancelled) return;
        console.log(`${LOG} Step 1/3: Eye tracking controller ready`);

        console.log(`${LOG} Step 2/3: Starting camera for face tracking...`);
        const video = videoRef.current;
        if (video) {
          try {
            const stream = await startCamera(video);
            if (cancelled) {
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
            streamRef.current = stream;

            await new Promise<void>((resolve) => {
              if (video.readyState >= 2) resolve();
              else video.onloadeddata = () => resolve();
            });

            if (cancelled) return;

            setWebcamActive(true);
            startTracking(video, canvasRef.current ?? undefined);
            console.log(
              `${LOG} Step 2/3: Camera ready (${video.videoWidth}x${video.videoHeight}), tracking started`,
            );
          } catch {
            if (cancelled) return;
            console.warn(`${LOG} Camera unavailable — click or keyboard fallback active`);
            setWebcamError(
              'Camera not available. Use click or press 1-4 to select answers.',
            );
          }
        } else {
          console.warn(`${LOG} Video element not mounted`);
          setWebcamError(
            'Camera element unavailable. Use click or press 1-4 to select answers.',
          );
        }

        setModelLoading(false);

        console.log(`${LOG} Step 3/3: Starting gaze polling loop...`);
        isRunningRef.current = true;

        function gazeLoop() {
          if (!isRunningRef.current) return;

          const blinkDetected = detectBlinkSelection();
          const wink = detectWink();

          if (!answeredRef.current) {
            const target = getCurrentGazeTarget();
            if (target) {
              const fieldEl = document.querySelector('[data-bubble-field]');
              if (fieldEl) {
                const containerRect = fieldEl.getBoundingClientRect();
                const screenPos = {
                  x: containerRect.left + target.x * containerRect.width,
                  y: containerRect.top + target.y * containerRect.height,
                };
                const bubbles = Array.from(
                  fieldEl.querySelectorAll('.bubble'),
                ) as HTMLElement[];
                const closest = findClosestBubble(screenPos, bubbles, 350);

                if (closest !== gazeHoveredRef.current) {
                  gazeHoveredRef.current = closest;
                  setHoveredIndex(closest === -1 ? null : closest);
                }
              }

              if (
                blinkDetected &&
                gazeHoveredRef.current !== null &&
                gazeHoveredRef.current >= 0
              ) {
                console.log(
                  `${LOG} Blink selection on bubble ${gazeHoveredRef.current}`,
                );
                answeredRef.current = true;
                handleAnswerRef.current(gazeHoveredRef.current);
              }
            } else {
              if (gazeHoveredRef.current !== null) {
                gazeHoveredRef.current = null;
                setHoveredIndex(null);
              }
            }
          }

          // Wink-based navigation: right wink → next, left wink → previous
          // Only allow wink navigation if the question has been answered
          if (answeredRef.current) {
            if (wink === 'right') {
              console.log(`${LOG} Right wink → next question`);
              handleNextRef.current();
            } else if (wink === 'left') {
              console.log(`${LOG} Left wink → previous question`);
              handlePreviousRef.current();
            }
          }

          animFrameRef.current = requestAnimationFrame(gazeLoop);
        }

        gazeLoop();

        const elapsed = (performance.now() - bootStart).toFixed(0);
        console.log(
          `${LOG} Boot complete in ${elapsed}ms — gaze polling active`,
        );
      } catch (err) {
        const elapsed = (performance.now() - bootStart).toFixed(0);
        console.error(`${LOG} Boot failed after ${elapsed}ms:`, err);
        if (!cancelled) {
          setModelLoading(false);
          setWebcamError(
            'Eye tracking initialization failed. Use click or press 1-4 to select.',
          );
        }
      }
    }

    boot();

    return () => {
      console.log(`${LOG} Cleanup: stopping eye tracking and camera`);
      cancelled = true;
      isRunningRef.current = false;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      stopTracking();
      cleanupEyeTracking();
      stopCamera(streamRef.current, null);
      streamRef.current = null;
      if (popTimerRef.current !== null) {
        window.clearTimeout(popTimerRef.current);
        popTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Answer handling
  // ---------------------------------------------------------------------------
  const handleAnswer = useCallback(
    (index: number) => {
      if (answeredRef.current || answered) return;
      answeredRef.current = true;
      setSelectedIndex(index);
      setAnswered(true);
      const alreadyAnsweredThisQuestion = answeredIds.includes(question.id);
      const newScore =
        !alreadyAnsweredThisQuestion && index === question.answerIndex
          ? score + 1
          : score;
      const isCorrect = index === question.answerIndex;
      if (isCorrect && !alreadyAnsweredThisQuestion) {
        setScore(newScore);
      }
      playPopAndShowResult(index, isCorrect);
      const newIds = alreadyAnsweredThisQuestion
        ? answeredIds
        : [...answeredIds, question.id];
      setAnsweredIds(newIds);
      saveReviewProgress({
        questionSetId: activeSet.id,
        currentIndex,
        score: newScore,
        answeredIds: newIds,
      });
    },
    [
      answered,
      question.answerIndex,
      question.id,
      score,
      answeredIds,
      currentIndex,
      playPopAndShowResult,
      activeSet.id,
    ],
  );

  // Keep the ref-based handler current so the gaze loop avoids stale closures
  useEffect(() => {
    handleAnswerRef.current = (index: number) => {
      setSelectedIndex(index);
      setAnswered(true);
      const q = questions[safeIndex];
      if (!q) return;
      const alreadyAnsweredThisQuestion = answeredIds.includes(q.id);
      const newScore =
        !alreadyAnsweredThisQuestion && index === q.answerIndex ? score + 1 : score;
      const isCorrect = index === q.answerIndex;
      if (isCorrect && !alreadyAnsweredThisQuestion) {
        setScore(newScore);
      }
      playPopAndShowResult(index, isCorrect);
      const newIds = alreadyAnsweredThisQuestion
        ? answeredIds
        : [...answeredIds, q.id];
      setAnsweredIds(newIds);
      saveReviewProgress({
        questionSetId: activeSet.id,
        currentIndex,
        score: newScore,
        answeredIds: newIds,
      });
    };
  }, [safeIndex, questions, score, answeredIds, playPopAndShowResult, currentIndex, activeSet.id]);

  // ---------------------------------------------------------------------------
  // Eye-selection handler — the primary entry point for gaze+blink and the
  // keyboard fallback. When real eye tracking is integrated, route through here.
  // ---------------------------------------------------------------------------
  const onEyeSelection = useCallback(
    (bubbleIndex: number) => {
      if (answeredRef.current || answered) return;
      console.log(`${LOG} onEyeSelection(${bubbleIndex})`);
      handleAnswer(bubbleIndex);
    },
    [answered, handleAnswer],
  );

  // Keyboard fallback: press 1-4 to select a bubble for testing
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (showAddSetModal || !started) return;
      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= 4 && !answeredRef.current) {
        e.preventDefault();
        onEyeSelection(digit - 1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddSetModal, started, onEyeSelection]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  const resetReviewSession = useCallback((targetIndex = 0) => {
    answeredRef.current = false;
    setCurrentIndex(targetIndex);
    setAnswered(false);
    setSelectedIndex(null);
    setScore(0);
    setFinished(false);
    setHoveredIndex(null);
    setAnsweredIds([]);
    gazeHoveredRef.current = null;
    setPoppedIndex(null);
    setResultBadge(null);
    if (popTimerRef.current !== null) {
      window.clearTimeout(popTimerRef.current);
      popTimerRef.current = null;
    }
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
    clearReviewProgress();
    // Force a save with empty state to ensure it's cleared from localStorage
    saveReviewProgress({
      questionSetId: activeSet.id,
      currentIndex: targetIndex,
      score: 0,
      answeredIds: [],
    });
  }, [activeSet.id]);

  const handleNext = useCallback(() => {
    const next = currentIndex + 1;
    if (next >= questions.length) {
      setFinished(true);
      // Don't clear progress when finished, so they can see their score if they reload
      saveReviewProgress({
        questionSetId: activeSet.id,
        currentIndex: next,
        score,
        answeredIds,
      });
    } else {
      answeredRef.current = false;
      setCurrentIndex(next);
      setAnswered(false);
      setSelectedIndex(null);
      setHoveredIndex(null);
      gazeHoveredRef.current = null;
      setPoppedIndex(null);
      setResultBadge('NEXT');
      if (popTimerRef.current !== null) {
        window.clearTimeout(popTimerRef.current);
        popTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setResultBadge(null);
        successTimerRef.current = null;
      }, 1000);
      saveReviewProgress({
        questionSetId: activeSet.id,
        currentIndex: next,
        score,
        answeredIds,
      });
    }
  }, [currentIndex, score, answeredIds, questions.length, activeSet.id]);

  const handlePrevious = useCallback(() => {
    const prev = Math.max(0, currentIndex - 1);
    answeredRef.current = false;
    setCurrentIndex(prev);
    setAnswered(false);
    setSelectedIndex(null);
    setHoveredIndex(null);
    gazeHoveredRef.current = null;
    setPoppedIndex(null);
    setResultBadge('PREV');
    if (popTimerRef.current !== null) {
      window.clearTimeout(popTimerRef.current);
      popTimerRef.current = null;
    }
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
    }
    successTimerRef.current = window.setTimeout(() => {
      setResultBadge(null);
      successTimerRef.current = null;
    }, 1000);
    saveReviewProgress({
      questionSetId: activeSet.id,
      currentIndex: prev,
      score,
      answeredIds,
    });
  }, [currentIndex, score, answeredIds, activeSet.id]);

  const handleRestart = useCallback(() => {
    resetReviewSession(0);
  }, [resetReviewSession]);

  const applyAndSwitchQuestionSet = useCallback(
    (nextSetId: string) => {
      setActiveSetId(nextSetId);
      // We can't use resetReviewSession directly here because it depends on activeSet.id
      // which hasn't updated yet. We need to clear manually for the new set.
      answeredRef.current = false;
      setCurrentIndex(0);
      setAnswered(false);
      setSelectedIndex(null);
      setScore(0);
      setFinished(false);
      setHoveredIndex(null);
      setAnsweredIds([]);
      gazeHoveredRef.current = null;
      setPoppedIndex(null);
      setResultBadge(null);
      if (popTimerRef.current !== null) {
        window.clearTimeout(popTimerRef.current);
        popTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      clearReviewProgress();
      saveReviewProgress({
        questionSetId: nextSetId,
        currentIndex: 0,
        score: 0,
        answeredIds: [],
      });
    },
    [],
  );

  const handleApplyNewQuestionSet = useCallback(() => {
    const validation = validateQuestionSetPayload(newSetJson);
    if (!validation.ok) {
      setSetValidationErrors(validation.errors);
      return;
    }

    const nextSet: ReviewQuestionSet = {
      id: toCustomSetId(validation.data.name),
      name: validation.data.name,
      description: validation.data.description,
      schemaVersion: validation.data.schemaVersion,
      questions: validation.data.questions,
      source: 'custom',
    };

    setCustomSets((prev) => [...prev, nextSet]);
    setSetValidationErrors([]);
    setShowAddSetModal(false);
    setNewSetJson('');
    applyAndSwitchQuestionSet(nextSet.id);
  }, [newSetJson, applyAndSwitchQuestionSet]);

  const handleQuestionSetChange = useCallback(
    (setId: string) => {
      setSetValidationErrors([]);
      applyAndSwitchQuestionSet(setId);
    },
    [applyAndSwitchQuestionSet],
  );

  const handleCopyFormat = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(REVIEW_FORMAT_PROMPT);
      setFormatCopied(true);
      window.setTimeout(() => setFormatCopied(false), 2000);
    } catch {
      setFormatCopied(false);
    }
  }, []);

  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
  }, [handleNext, handlePrevious]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (finished) {
    return (
      <div className="review-container review-container--eye-tracking">
        <div className="review-dataset-card">
          <p className="review-dataset-title">{activeSet.name}</p>
          <p className="review-dataset-description">{activeSet.description}</p>
        </div>
        <div className="review-finished">
          <h2>Review Complete</h2>
          <p className="review-score-final">
            {score} / {questions.length} correct
          </p>
          <button className="btn" onClick={handleRestart}>
            Try Again
          </button>
        </div>
        <p className="powered-by">
          Powered by MediaPipe FaceLandmarker eye tracking (processed locally in your browser).
          <br />
          <span className="powered-by-note">
            Look at a bubble to highlight it green, then blink to select. After answering, right wink → next, left wink → previous.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="review-container review-container--eye-tracking">
      <div className="review-dataset-controls">
        <div className="review-dataset-picker">
          <label htmlFor="review-set-select">Question Set</label>
          <select
            id="review-set-select"
            value={activeSet.id}
            onChange={(e) => handleQuestionSetChange(e.target.value)}
          >
            {(() => {
              const builtIn = builtInSets as ReviewQuestionSet[];
              const byTopic = new Map<string, ReviewQuestionSet[]>();
              for (const set of builtIn) {
                const topic = set.topic ?? 'core';
                if (!byTopic.has(topic)) byTopic.set(topic, []);
                byTopic.get(topic)!.push(set);
              }
              const topicOrder = ['core', 'data_structures', 'algorithms', 'data_types', 'hash_maps', 'complexity', 'pythonic_patterns', 'error_handling'];
              const orderedTopics = topicOrder.filter((t) => byTopic.has(t));
              return (
                <>
                  {orderedTopics.map((topicKey) => (
                    <optgroup
                      key={topicKey}
                      label={TOPIC_LABELS[topicKey] ?? topicKey}
                    >
                      {byTopic.get(topicKey)!.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} (Built-in)
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {customSets.length > 0 && (
                    <optgroup label="Custom">
                      {customSets.map((set) => (
                        <option key={set.id} value={set.id}>
                          {set.name} (Custom)
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              );
            })()}
          </select>
        </div>
        <button
          className="btn btn-outline"
          onClick={() => {
            setSetValidationErrors([]);
            setShowAddSetModal(true);
          }}
        >
          Add new questions
        </button>
      </div>

      <div className="review-dataset-card">
        <div className="review-dataset-card-inner">
          <div>
            <p className="review-dataset-title">{activeSet.name}</p>
            <p className="review-dataset-description">{activeSet.description}</p>
          </div>
          {!started ? (
            <button className="btn review-start-btn" onClick={() => setStarted(true)}>
              Start
            </button>
          ) : (
            <button
              className="btn btn-outline review-start-btn review-stop-btn"
              onClick={() => setStarted(false)}
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="review-header-bar">
        <span className="review-progress">
          Question {safeIndex + 1} / {questions.length}
        </span>
        <span className="review-score">Score: {score}</span>
      </div>

      <h2 className="review-question">{question.question}</h2>

      <div className="webcam-status">
        {modelLoading && (
          <p className="status-loading">Starting camera and eye tracking model...</p>
        )}
        {webcamError && <p className="status-error">{webcamError}</p>}
      </div>

      <div className="camera-bubble-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`webcam-bg ${webcamActive ? 'active' : ''}`}
        />

        <canvas ref={canvasRef} className="eye-tracking-canvas" />

        {modelLoading && (
          <div className="model-loading-overlay">
            <div className="model-loading-spinner" />
            <p className="model-loading-text">Loading eye tracking model...</p>
          </div>
        )}

        {!modelLoading && started && (!answered || poppedIndex !== null) && (
          <div className="bubble-overlay">
            <BubbleField
              questionKey={question.id}
              choices={question.choices}
              answerIndex={question.answerIndex}
              answered={answered}
              selectedIndex={selectedIndex}
              onAnswer={handleAnswer}
              hoveredIndex={hoveredIndex}
              poppedIndex={poppedIndex}
              fixed
            />
          </div>
        )}

        {resultBadge && (
          <div
            className={`success-badge ${
              resultBadge === 'WRONG!' ? 'success-badge--wrong' : ''
            } ${
              resultBadge === 'NEXT' || resultBadge === 'PREV' ? 'success-badge--nav' : ''
            }`}
          >
            {resultBadge}
          </div>
        )}
      </div>

      {answered && (
        <div className="review-explanation">
          <p
            className={
              selectedIndex === question.answerIndex
                ? 'review-result--correct'
                : 'review-result--incorrect'
            }
          >
            {selectedIndex === question.answerIndex ? 'CORRECT!' : 'Incorrect'}
          </p>
          <p>{question.explanation}</p>
          <p className="review-gesture-hint">
            Right wink → next, left wink → previous.
          </p>
          <div className="review-nav-actions">
            <button
              className="btn btn-outline"
              onClick={handlePrevious}
              disabled={safeIndex === 0}
            >
              Previous Question
            </button>
            <button className="btn" onClick={handleNext}>
              Next Question
            </button>
          </div>
        </div>
      )}

      <p className="powered-by">
        Powered by MediaPipe FaceLandmarker eye tracking (processed locally in your browser).
        <br />
        <span className="powered-by-note">
          Look at a bubble to highlight it green, then blink to select. After answering, right wink → next, left wink → previous.
        </span>
      </p>

      {showAddSetModal && (
        <div className="review-modal-backdrop" role="dialog" aria-modal="true">
          <div className="review-modal assembly-add-modal">
            <div className="review-modal-scroll">
              <h3>Add your own study questions</h3>
              <p className="review-modal-intro">
                You can create new question sets using a free chatbot (like ChatGPT, Copilot, or Gemini). Follow the two steps below.
              </p>

              <div className="assembly-add-step">
                <p className="assembly-add-step-title">Step 1: Get questions from a chatbot</p>
                <ol className="assembly-add-step-list">
                  <li>Click the &quot;Copy the text below&quot; button.</li>
                  <li>Open a chatbot you use (e.g. ChatGPT, Microsoft Copilot, or Google Gemini) in another tab or app.</li>
                  <li>At the top of the copied text you&apos;ll see <strong>Topic:</strong> and <strong>Description:</strong>. Replace the brackets with what you want to study (e.g. &quot;Python decorators&quot; or &quot;Data structures&quot;).</li>
                  <li>Paste the whole text into the chatbot and send it. The chatbot will reply with a block of text.</li>
                  <li>Copy everything the chatbot gives you — you&apos;ll need it for Step 2.</li>
                </ol>
                <div className="review-format-block">
                  <pre className="review-format-pre">{REVIEW_FORMAT_PROMPT}</pre>
                  <button
                    type="button"
                    className="btn btn-sm review-copy-format-btn"
                    onClick={handleCopyFormat}
                  >
                    {formatCopied ? 'Copied!' : 'Copy the text below'}
                  </button>
                </div>
              </div>

              <div className="assembly-add-step">
                <p className="assembly-add-step-title">Step 2: Add the questions to this app</p>
                <ol className="assembly-add-step-list">
                  <li>Paste the text you copied from the chatbot into the box below.</li>
                  <li>Click <strong>Add questions</strong>. Your new set will appear in the &quot;Question set&quot; dropdown and you can start practicing.</li>
                </ol>
                <label htmlFor="eye-review-paste-box" className="review-json-label">Paste what the chatbot gave you here:</label>
                <textarea
                  id="eye-review-paste-box"
                  className="review-json-input"
                  value={newSetJson}
                  onChange={(e) => setNewSetJson(e.target.value)}
                  placeholder="Paste the chatbot's reply here..."
                  rows={10}
                />
                {setValidationErrors.length > 0 && (
                  <ul className="review-validation-errors">
                    {setValidationErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="review-modal-actions">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => { setSetValidationErrors([]); setShowAddSetModal(false); }}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={handleApplyNewQuestionSet}>
                Add questions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
