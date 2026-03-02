import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { GestureRecognizer } from '@mediapipe/tasks-vision';
import {
  builtInSets,
  getBuiltInSetById,
  TOPIC_LABELS,
  type ReviewQuestionSet as RegistryQuestionSet,
} from '../../data/questionRegistry';
import { BubbleField } from './BubbleField';
import { PoweredBy } from './PoweredBy';
import {
  initGestureRecognizer,
  runDetectionLoop,
} from '../../lib/mediapipe/gesture';
import type { DetectionResult } from '../../lib/mediapipe/gesture';
import { startCamera, stopCamera } from '../../lib/mediapipe/camera';
import { landmarkToScreen, findClosestBubble } from '../../lib/mediapipe/coords';
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
import {
  initLLMEngine,
  streamChat,
  buildQuestionGenPrompt,
} from '../../lib/evaluate/llm';
import type { MLCEngine } from '@mlc-ai/web-llm';

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

const INDEX_FINGERTIP = 8;
const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const POINT_CONFIRM_FRAMES = 3;
const SWIPE_DISTANCE = 0.1;
const SWIPE_MAX_DURATION_MS = 900;
const SWIPE_COOLDOWN_MS = 900;
const LOG = '[ReviewMode]';

const LLM_FORMAT_PROMPT = `Generate a technical interview review question set as valid JSON only (no markdown, no explanation). Use this exact structure:

{
  "schemaVersion": 1,
  "name": "Your Set Name",
  "description": "One sentence describing the set.",
  "questions": [
    {
      "id": "unique-id-001",
      "topic": "topic-slug",
      "question": "Your question text?",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 0,
      "explanation": "Why the correct answer is right."
    }
  ]
}

Rules: 5-10 questions, exactly 4 choices per question, answerIndex 0-3, unique ids.`;

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

export function ReviewContainer() {
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

  // Webcam / MediaPipe state
  const [webcamActive, setWebcamActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [poppedIndex, setPoppedIndex] = useState<number | null>(null);
  const [resultBadge, setResultBadge] = useState<'CORRECT!' | 'WRONG!' | null>(
    null,
  );
  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [newSetJson, setNewSetJson] = useState('');
  const [setValidationErrors, setSetValidationErrors] = useState<string[]>([]);

  const [genTopic, setGenTopic] = useState('');
  const [genDescription, setGenDescription] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [genProgress, setGenProgress] = useState('');
  const [genError, setGenError] = useState<string | null>(null);
  const genEngineRef = useRef<MLCEngine | null>(null);
  const [formatCopied, setFormatCopied] = useState(false);

  // Refs to avoid stale closures in the detection loop
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isRunningRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const lastPointedBubbleRef = useRef<number | null>(null);
  const pointedFramesRef = useRef(0);
  const answeredRef = useRef(false);
  const handleAnswerRef = useRef<(index: number) => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const popTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const answerIndexRef = useRef(0);
  const swipeActiveRef = useRef(false);
  const swipeStartXRef = useRef(0);
  const swipeStartYRef = useRef(0);
  const swipeStartTsRef = useRef(0);
  const swipeCooldownUntilRef = useRef(0);

  const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(questions.length - 1, 0)));
  const question = questions[safeIndex];

  // Set correct-answer index once per question so the detection loop only compares numbers (no JSON)
  useEffect(() => {
    if (!question) return;
    answerIndexRef.current = question.answerIndex;
    console.log(
      `${LOG} Correct answer for this question: bubble ${question.answerIndex} (0-based index)`,
    );
  }, [question]);

  const playPopAndShowResult = useCallback((index: number, isCorrect: boolean) => {
    setPoppedIndex(index);
    if (popTimerRef.current !== null) {
      window.clearTimeout(popTimerRef.current);
    }
    popTimerRef.current = window.setTimeout(() => {
      setPoppedIndex(null);
      popTimerRef.current = null;
    }, 420);

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

  const resetSwipeTracking = useCallback(() => {
    swipeActiveRef.current = false;
    swipeStartTsRef.current = 0;
  }, []);

  const isNaturalSwipePose = useCallback((result: DetectionResult): boolean => {
    if (result.landmarks.length < 21) return false;

    const wrist = result.landmarks[WRIST];
    const indexMcp = result.landmarks[INDEX_MCP];
    const middleMcp = result.landmarks[MIDDLE_MCP];
    const pinkyMcp = result.landmarks[PINKY_MCP];

    // Hand should be generally upright: MCPs above wrist in image space.
    const upright = middleMcp.y < wrist.y - 0.01;

    // Keep it practical: open-ish hand width is a reliable proxy.
    const openHandWidth = Math.abs(indexMcp.x - pinkyMcp.x) > 0.12;

    // Prefer explicit open-palm label, but keep pose fallback for robustness.
    const openPalmGesture = result.gesture === 'Open_Palm';

    return upright && (openPalmGesture || openHandWidth);
  }, []);

  const handleSwipeNavigation = useCallback(
    (result: DetectionResult) => {
      if (result.landmarks.length < 21) {
        resetSwipeTracking();
        return;
      }

      const now = performance.now();
      if (now < swipeCooldownUntilRef.current) return;

      if (!isNaturalSwipePose(result)) {
        resetSwipeTracking();
        return;
      }

      const wrist = result.landmarks[WRIST];
      if (!swipeActiveRef.current) {
        swipeActiveRef.current = true;
        swipeStartXRef.current = wrist.x;
        swipeStartYRef.current = wrist.y;
        swipeStartTsRef.current = now;
        return;
      }

      const elapsed = now - swipeStartTsRef.current;
      if (elapsed > SWIPE_MAX_DURATION_MS) {
        resetSwipeTracking();
        return;
      }

      // Video is mirrored in CSS, so invert X delta to match on-screen direction.
      const dxScreen = -(wrist.x - swipeStartXRef.current);
      const dy = Math.abs(wrist.y - swipeStartYRef.current);
      const horizontalEnough = Math.abs(dxScreen) > SWIPE_DISTANCE;
      const mostlyHorizontal = Math.abs(dxScreen) > dy * 1.3;

      if (!horizontalEnough || !mostlyHorizontal) return;

      resetSwipeTracking();
      swipeCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;

      if (dxScreen > 0) {
        console.log(`${LOG} Swipe RIGHT detected -> next question`);
        handleNextRef.current();
      } else {
        console.log(`${LOG} Swipe LEFT detected -> previous question`);
        handlePreviousRef.current();
      }
    },
    [isNaturalSwipePose, resetSwipeTracking],
  );

  // Detection result handler — point at a bubble to select immediately (no hold)
  const onDetectionResult = useCallback(
    (result: DetectionResult) => {
      if (answeredRef.current) {
        handleSwipeNavigation(result);
        return;
      }

      if (result.landmarks.length === 0) {
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          setHoveredIndex(null);
        }
        lastPointedBubbleRef.current = null;
        pointedFramesRef.current = 0;
        return;
      }

      const fieldEl = document.querySelector('[data-bubble-field]');
      if (!fieldEl) return;

      const containerRect = fieldEl.getBoundingClientRect();
      const tip = result.landmarks[INDEX_FINGERTIP];
      const screenPos = landmarkToScreen(tip, containerRect, true);
      const bubbles = Array.from(fieldEl.querySelectorAll('.bubble')) as HTMLElement[];
      const closest = findClosestBubble(screenPos, bubbles, 100);

      if (closest !== hoveredRef.current) {
        hoveredRef.current = closest;
        setHoveredIndex(closest === -1 ? null : closest);
        if (closest >= 0) {
          const isCorrectBubble = closest === answerIndexRef.current;
          console.log(
            `${LOG} Fingertip hovering bubble ${closest} (correct answer: ${isCorrectBubble ? 'yes' : 'no'})`,
          );
        }
      }

      // Pointing at a bubble = select immediately, show CORRECT/WRONG
      const isPointing = result.gesture === 'Pointing_Up';
      if (!isPointing || closest < 0) {
        lastPointedBubbleRef.current = null;
        pointedFramesRef.current = 0;
        return;
      }

      if (lastPointedBubbleRef.current === closest) {
        pointedFramesRef.current += 1;
      } else {
        lastPointedBubbleRef.current = closest;
        pointedFramesRef.current = 1;
      }

      if (pointedFramesRef.current >= POINT_CONFIRM_FRAMES) {
        const correct = closest === answerIndexRef.current;
        console.log(
          `${LOG} Pointing at bubble ${closest} → ${correct ? 'CORRECT' : 'WRONG'} (${POINT_CONFIRM_FRAMES}-frame confirm)`,
        );
        answeredRef.current = true;
        handleAnswerRef.current(closest);
      }
    },
    [handleSwipeNavigation],
  );

  // Auto-start webcam on mount, cleanup on unmount.
  // No mountedRef guard — React StrictMode double-mounts in dev,
  // and we need the second mount to actually boot. Each mount gets
  // its own `cancelled` flag so the first one cleans up properly.
  useEffect(() => {
    let cancelled = false;
    const bootStart = performance.now();

    console.log(`${LOG} Boot sequence starting...`);
    console.log(`${LOG}   Questions loaded: ${questions.length}`);

    async function boot() {
      try {
        console.log(`${LOG} Step 1/4: Initializing gesture recognizer...`);
        recognizerRef.current = await initGestureRecognizer();
        console.log(`${LOG} Step 1/4: Gesture recognizer ready`);

        if (cancelled) {
          console.log(`${LOG} Boot cancelled after model init (StrictMode unmount)`);
          return;
        }

        console.log(`${LOG} Step 2/4: Starting camera...`);
        const video = videoRef.current;
        if (!video) {
          console.error(`${LOG} Video element ref is null — cannot start camera`);
          return;
        }
        const stream = await startCamera(video);
        if (cancelled) {
          console.log(`${LOG} Boot cancelled after camera start — cleaning up stream`);
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        console.log(`${LOG} Step 2/4: Camera stream acquired`);

        console.log(`${LOG} Step 3/4: Waiting for video data...`);
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) {
            resolve();
          } else {
            video.onloadeddata = () => resolve();
          }
        });

        if (cancelled) {
          console.log(`${LOG} Boot cancelled after video ready`);
          return;
        }

        const elapsed = (performance.now() - bootStart).toFixed(0);
        console.log(
          `${LOG} Step 3/4: Video ready (${video.videoWidth}x${video.videoHeight})`,
        );

        setWebcamActive(true);
        setModelLoading(false);

        console.log(`${LOG} Step 4/4: Starting detection loop...`);
        isRunningRef.current = true;
        runDetectionLoop(
          recognizerRef.current,
          video,
          onDetectionResult,
          isRunningRef,
        );

        console.log(
          `${LOG} Boot complete in ${elapsed}ms — webcam active, detection running`,
        );
      } catch (err) {
        const elapsed = (performance.now() - bootStart).toFixed(0);
        console.error(`${LOG} Boot failed after ${elapsed}ms:`, err);
        if (!cancelled) {
          setModelLoading(false);
          setWebcamError(
            'Camera access denied or unavailable. Use click/tap to answer.',
          );
        }
      }
    }

    boot();

    return () => {
      console.log(`${LOG} Cleanup: stopping camera and detection loop`);
      cancelled = true;
      isRunningRef.current = false;
      stopCamera(streamRef.current, animFrameRef.current);
      streamRef.current = null;
      resetSwipeTracking();
      if (popTimerRef.current !== null) {
        window.clearTimeout(popTimerRef.current);
        popTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [onDetectionResult, resetSwipeTracking]);

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

  // Keep the ref-based answer handler up to date so the detection loop
  // always calls the latest version without needing to be in its deps
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

  const resetReviewSession = useCallback((targetIndex = 0) => {
    answeredRef.current = false;
    setCurrentIndex(targetIndex);
    setAnswered(false);
    setSelectedIndex(null);
    setScore(0);
    setFinished(false);
    setHoveredIndex(null);
    setAnsweredIds([]);
    hoveredRef.current = null;
    lastPointedBubbleRef.current = null;
    pointedFramesRef.current = 0;
    resetSwipeTracking();
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
  }, [resetSwipeTracking]);

  const handleNext = useCallback(() => {
    const next = currentIndex + 1;
    if (next >= questions.length) {
      setFinished(true);
      clearReviewProgress();
    } else {
      answeredRef.current = false;
      setCurrentIndex(next);
      setAnswered(false);
      setSelectedIndex(null);
      setHoveredIndex(null);
      hoveredRef.current = null;
      lastPointedBubbleRef.current = null;
      pointedFramesRef.current = 0;
      resetSwipeTracking();
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
      saveReviewProgress({
        questionSetId: activeSet.id,
        currentIndex: next,
        score,
        answeredIds,
      });
    }
  }, [currentIndex, score, answeredIds, questions.length, resetSwipeTracking, activeSet.id]);

  const handlePrevious = useCallback(() => {
    const prev = currentIndex - 1;
    if (prev < 0) {
      return;
    }
    answeredRef.current = false;
    setCurrentIndex(prev);
    setAnswered(false);
    setSelectedIndex(null);
    setHoveredIndex(null);
    hoveredRef.current = null;
    lastPointedBubbleRef.current = null;
    pointedFramesRef.current = 0;
    resetSwipeTracking();
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
    saveReviewProgress({
      questionSetId: activeSet.id,
      currentIndex: prev,
      score,
      answeredIds,
    });
  }, [currentIndex, score, answeredIds, resetSwipeTracking, activeSet.id]);

  const handleRestart = useCallback(() => {
    resetReviewSession(0);
  }, [resetReviewSession]);

  const applyAndSwitchQuestionSet = useCallback(
    (nextSetId: string) => {
      setActiveSetId(nextSetId);
      resetReviewSession(0);
    },
    [resetReviewSession],
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
      await navigator.clipboard.writeText(LLM_FORMAT_PROMPT);
      setFormatCopied(true);
      window.setTimeout(() => setFormatCopied(false), 2000);
    } catch {
      setFormatCopied(false);
    }
  }, []);

  const handleGenerateQuestions = useCallback(async () => {
    if (!genTopic.trim()) return;

    if (!(navigator as unknown as Record<string, unknown>).gpu) {
      setGenError('WebGPU is not supported in this browser. Use Chrome or Edge.');
      return;
    }

    setGenLoading(true);
    setGenError(null);
    setNewSetJson('');
    setSetValidationErrors([]);

    try {
      const engine = await initLLMEngine((p) => setGenProgress(p.text));
      genEngineRef.current = engine;
      setGenProgress('');

      const messages = [
        {
          role: 'system' as const,
          content: buildQuestionGenPrompt(genTopic.trim(), genDescription.trim()),
        },
        { role: 'user' as const, content: 'Generate the questions now.' },
      ];

      const raw = await streamChat(
        engine,
        messages,
        (partial) => setNewSetJson(partial),
        2048,
      );

      const cleaned = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      setNewSetJson(cleaned);
    } catch (err) {
      console.error('Question generation failed:', err);
      setGenError('Generation failed. Check console and try again.');
    } finally {
      setGenLoading(false);
      setGenProgress('');
    }
  }, [genTopic, genDescription]);

  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
  }, [handleNext, handlePrevious]);

  if (finished) {
    return (
      <div className="review-container">
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
        <PoweredBy />
      </div>
    );
  }

  return (
    <div className="review-container">
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
          <p className="status-loading">Starting camera and AI model...</p>
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

        {modelLoading && (
          <div className="model-loading-overlay">
            <div className="model-loading-spinner" />
            <p className="model-loading-text">Loading hand tracking model...</p>
          </div>
        )}

        {!modelLoading && started && (
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
            />
          </div>
        )}

        {resultBadge && (
          <div
            className={`success-badge ${
              resultBadge === 'WRONG!' ? 'success-badge--wrong' : ''
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
            Swipe hand right for next, left for previous.
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

      <PoweredBy />

      {showAddSetModal && (
        <div className="review-modal-backdrop" role="dialog" aria-modal="true">
          <div className="review-modal">
            <div className="review-modal-scroll">
              <h3>Add New Questions</h3>
              <p className="review-modal-intro">
                Choose one way to get your questions, then paste or review the JSON in the box at the bottom and click Apply.
              </p>

              <div className="review-option review-option-recommend">
                <p className="review-option-label">Option 1: Use ChatGPT / Copilot / Gemini (recommended)</p>
                <p className="review-recommend-text">
                  Our in-browser model can be slow. For best experience, use an external LLM: copy the format below, paste it into ChatGPT (or Copilot, Gemini, etc.), add your topic or instructions, then paste the generated JSON into the box at the bottom.
                </p>
                <div className="review-format-block">
                  <pre className="review-format-pre">{LLM_FORMAT_PROMPT}</pre>
                  <button
                    type="button"
                    className="btn btn-sm review-copy-format-btn"
                    onClick={handleCopyFormat}
                  >
                    {formatCopied ? 'Copied!' : 'Copy format for ChatGPT / Copilot / Gemini'}
                  </button>
                </div>
              </div>

              <div className="review-option review-option-inline">
                <p className="review-option-label">Option 2: Generate in this browser</p>
                <p className="review-option-desc">Uses a slower in-browser model. Enter a topic and description, then click Generate. The result will appear in the JSON box below for you to review.</p>
                <div className="review-gen-section">
                  <div className="review-gen-inputs">
                    <input
                      type="text"
                      className="review-gen-input"
                      placeholder="Topic (e.g. Python decorators)"
                      value={genTopic}
                      onChange={(e) => setGenTopic(e.target.value)}
                      disabled={genLoading}
                    />
                    <input
                      type="text"
                      className="review-gen-input"
                      placeholder="Brief description (e.g. intermediate-level questions)"
                      value={genDescription}
                      onChange={(e) => setGenDescription(e.target.value)}
                      disabled={genLoading}
                    />
                  </div>
                  <div className="review-gen-row">
                    <button
                      className="btn btn-sm ai-btn-active"
                      onClick={handleGenerateQuestions}
                      disabled={!genTopic.trim() || genLoading}
                    >
                      {genLoading ? 'Generating...' : 'Generate'}
                    </button>
                    {genProgress && (
                      <span className="review-gen-progress">{genProgress}</span>
                    )}
                  </div>
                  {genError && <p className="status-error">{genError}</p>}
                </div>
              </div>

              <p className="review-json-label">Your JSON — paste from Option 1 or from Option 2 above, then click Apply</p>
              <textarea
                className="review-json-input"
                value={newSetJson}
                onChange={(e) => setNewSetJson(e.target.value)}
                disabled={genLoading}
                placeholder={`{
  "schemaVersion": 1,
  "name": "My Python Set",
  "description": "Warmup questions",
  "questions": [
    {
      "id": "my-001",
      "topic": "python-basics",
      "question": "Example?",
      "choices": ["a", "b", "c", "d"],
      "answerIndex": 2,
      "explanation": "..."
    }
  ]
}`}
                rows={14}
              />
              {setValidationErrors.length > 0 && (
                <ul className="review-validation-errors">
                  {setValidationErrors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="review-modal-actions">
              <button
                className="btn btn-outline"
                onClick={() => {
                  setSetValidationErrors([]);
                  setShowAddSetModal(false);
                }}
                disabled={genLoading}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleApplyNewQuestionSet}
                disabled={genLoading}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
