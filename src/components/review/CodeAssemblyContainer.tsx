import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { flushSync } from 'react-dom';
import type { GestureRecognizer } from '@mediapipe/tasks-vision';
import { TokenField } from './TokenField';
import { PoweredBy } from './PoweredBy';
import {
  initGestureRecognizer,
  runDetectionLoop,
} from '../../lib/mediapipe/gesture';
import type { DetectionResult } from '../../lib/mediapipe/gesture';
import { startCamera, stopCamera } from '../../lib/mediapipe/camera';
import { landmarkToScreen, findClosestBubble } from '../../lib/mediapipe/coords';
import {
  saveCustomAssemblySets,
  loadCustomAssemblySets,
  saveActiveAssemblySetId,
  loadActiveAssemblySetId,
  type StoredAssemblyQuestionSet,
} from '../../lib/storage/localStore';
import coreAssemblyData from '../../data/code_assembly_questions/python_review/questions/python_code_assembly_questions.json';
import dataStructuresAssemblyData from '../../data/code_assembly_questions/python_review/data_structures/python_data_structures_assembly.json';
import algorithmsAssemblyData from '../../data/code_assembly_questions/python_review/algorithms/python_algorithms_assembly.json';
import dataTypesAssemblyData from '../../data/code_assembly_questions/python_review/data_types/python_data_types_assembly.json';
import hashMapsAssemblyData from '../../data/code_assembly_questions/python_review/hash_maps/python_hash_maps_assembly.json';
import complexityAssemblyData from '../../data/code_assembly_questions/python_review/complexity/python_complexity_assembly.json';
import pythonicPatternsAssemblyData from '../../data/code_assembly_questions/python_review/pythonic_patterns/python_pythonic_patterns_assembly.json';
import errorHandlingAssemblyData from '../../data/code_assembly_questions/python_review/error_handling/python_error_handling_assembly.json';
import fileIoAssemblyData from '../../data/code_assembly_questions/python_review/file_io/python_file_review.json';

interface AssemblyQuestion {
  id: string;
  question: string;
  tokens: string[];
  validAnswers: string[][];
  explanation: string;
}

interface AssemblyQuestionFile {
  schemaVersion: number;
  name: string;
  description: string;
  questions: AssemblyQuestion[];
}

interface BuiltInAssemblySet extends StoredAssemblyQuestionSet {
  source: 'built-in';
  topic: string;
}

const ASSEMBLY_TOPIC_LABELS: Record<string, string> = {
  core: 'Python Core',
  data_structures: 'Data Structures',
  algorithms: 'Algorithms',
  data_types: 'Data Types',
  hash_maps: 'Hash Maps',
  complexity: 'Complexity',
  pythonic_patterns: 'Pythonic Patterns',
  error_handling: 'Error Handling',
  file_io: 'File I/O',
};

const BUILTIN_ASSEMBLY_SET_ID = 'python-code-assembly';
function toBuiltInAssemblySet(file: AssemblyQuestionFile, id: string, topic: string): BuiltInAssemblySet {
  return {
    id,
    name: file.name,
    description: file.description,
    schemaVersion: file.schemaVersion ?? 1,
    questions: file.questions ?? [],
    source: 'built-in',
    topic,
  };
}

const builtInAssemblySets: BuiltInAssemblySet[] = [
  toBuiltInAssemblySet(coreAssemblyData as AssemblyQuestionFile, BUILTIN_ASSEMBLY_SET_ID, 'core'),
  toBuiltInAssemblySet(dataStructuresAssemblyData as AssemblyQuestionFile, 'builtin-assembly-data_structures', 'data_structures'),
  toBuiltInAssemblySet(algorithmsAssemblyData as AssemblyQuestionFile, 'builtin-assembly-algorithms', 'algorithms'),
  toBuiltInAssemblySet(dataTypesAssemblyData as AssemblyQuestionFile, 'builtin-assembly-data_types', 'data_types'),
  toBuiltInAssemblySet(hashMapsAssemblyData as AssemblyQuestionFile, 'builtin-assembly-hash_maps', 'hash_maps'),
  toBuiltInAssemblySet(complexityAssemblyData as AssemblyQuestionFile, 'builtin-assembly-complexity', 'complexity'),
  toBuiltInAssemblySet(pythonicPatternsAssemblyData as AssemblyQuestionFile, 'builtin-assembly-pythonic_patterns', 'pythonic_patterns'),
  toBuiltInAssemblySet(errorHandlingAssemblyData as AssemblyQuestionFile, 'builtin-assembly-error_handling', 'error_handling'),
  toBuiltInAssemblySet(fileIoAssemblyData as AssemblyQuestionFile, 'builtin-assembly-file_io', 'file_io'),
];

const ASSEMBLY_FORMAT_PROMPT = `Topic: [Your topic you wish to study]
Description: [Optional: difficulty, focus, learner level]

You are creating an interactive "assembly" study set. The user arranges short tokens in order to form the correct answer (e.g. a name, date, phrase, or line of code).
Return ONLY valid JSON (no markdown, no explanation, no backticks).
Generate exactly 8 questions for the topic above.

Example of a good question (user must assemble 2+ tokens):
{
  "id": "example-001",
  "question": "Assemble the leader of Nazi Germany.",
  "tokens": ["Adolf", "Hitler", "Winston", "Churchill", "Joseph", "Stalin"],
  "validAnswers": [["Adolf", "Hitler"]],
  "explanation": "Adolf Hitler was the leader of Nazi Germany."
}
Here the correct answer is two tokens in order; the rest are distractors (wrong but plausible).

Output this exact top-level structure:
{
  "schemaVersion": 1,
  "name": "string",
  "description": "string",
  "questions": [
    {
      "id": "string",
      "question": "string",
      "tokens": ["string"],
      "validAnswers": [["string"]],
      "explanation": "string"
    }
  ]
}

Hard requirements:
- "questions" must contain exactly 8 items.
- For MOST questions, the correct answer must be 2–4 tokens that the user puts in order (e.g. full name, event name, phrase). Avoid questions where the only correct answer is a single token — the game is about assembling, not just picking one pill.
- Tokens must be short (1–3 words max each) so they fit as small pills on screen.
- Include 2–4 distractor tokens per question: wrong-but-plausible options (other names, events, terms) that are NOT in any valid answer.
- "validAnswers" must be an array of arrays; include all valid orderings if multiple are correct.
- If a token appears twice in a valid answer, include it twice in "tokens".
- Every token used in any valid answer must exist in "tokens".
- Topic can be anything (history, science, language, coding, etc.).

Important:
- Do not leave placeholders.
- Fill "name" and "description" using the provided Topic/Description.
- Return one JSON object only.`;

function toCustomAssemblySetId(name: string): string {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `assembly-${clean || 'set'}-${Date.now()}`;
}

function validateAssemblySetPayload(raw: string): { ok: true; data: Omit<StoredAssemblyQuestionSet, 'id'> } | { ok: false; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, errors: ['Invalid JSON.'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, errors: ['JSON must be an object.'] };
  }
  const obj = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const name = obj.name;
  const description = obj.description;
  const schemaVersion = obj.schemaVersion;
  const questions = obj.questions;
  if (typeof name !== 'string' || !name.trim()) errors.push('"name" must be a non-empty string.');
  if (typeof description !== 'string' || !description.trim()) errors.push('"description" must be a non-empty string.');
  if (schemaVersion != null && typeof schemaVersion !== 'number') errors.push('"schemaVersion" must be a number.');
  if (!Array.isArray(questions) || questions.length === 0) errors.push('"questions" must be a non-empty array.');
  const normalized: AssemblyQuestion[] = [];
  const seenIds = new Set<string>();
  if (Array.isArray(questions)) {
    questions.forEach((item, i) => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        errors.push(`questions[${i}] must be an object.`);
        return;
      }
      const q = item as Record<string, unknown>;
      const id = q.id;
      const question = q.question;
      const tokens = q.tokens;
      const validAnswers = q.validAnswers;
      const explanation = q.explanation;
      if (typeof id !== 'string' || !id.trim()) errors.push(`questions[${i}].id required.`);
      else if (seenIds.has(id)) errors.push(`Duplicate id "${id}".`);
      else seenIds.add(id);
      if (typeof question !== 'string' || !question.trim()) errors.push(`questions[${i}].question required.`);
      if (!Array.isArray(tokens) || tokens.length === 0) errors.push(`questions[${i}].tokens must be a non-empty array.`);
      else if (tokens.some((t) => typeof t !== 'string')) errors.push(`questions[${i}].tokens must be strings.`);
      if (!Array.isArray(validAnswers) || validAnswers.length === 0) errors.push(`questions[${i}].validAnswers must be a non-empty array of token arrays.`);
      else if (validAnswers.some((a) => !Array.isArray(a) || a.some((t) => typeof t !== 'string'))) errors.push(`questions[${i}].validAnswers must be arrays of strings.`);
      if (typeof explanation !== 'string' || !explanation.trim()) errors.push(`questions[${i}].explanation required.`);
      if (typeof id === 'string' && typeof question === 'string' && Array.isArray(tokens) && Array.isArray(validAnswers) && validAnswers.length > 0 && typeof explanation === 'string') {
        normalized.push({ id: String(id).trim(), question: String(question).trim(), tokens: tokens.map(String), validAnswers: validAnswers.map((a) => (a as string[]).map(String)), explanation: String(explanation).trim() });
      }
    });
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data: { name: String(name).trim(), description: String(description).trim(), schemaVersion: typeof schemaVersion === 'number' ? schemaVersion : 1, questions: normalized } };
}

const INDEX_FINGERTIP = 8;
const INDEX_DIP = 7;
const TIP_EXTEND = 0.35;
const WRIST = 0;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const POINT_CONFIRM_FRAMES = 1;
const SWIPE_DISTANCE = 0.1;
const SWIPE_MAX_DURATION_MS = 900;
const SWIPE_COOLDOWN_MS = 900;
const LOG = '[CodeAssembly]';

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function CodeAssemblyContainer() {
  const [customSets, setCustomSets] = useState<StoredAssemblyQuestionSet[]>(() =>
    loadCustomAssemblySets().filter((s) => Array.isArray(s.questions) && s.questions.length > 0),
  );
  const [activeSetId, setActiveSetId] = useState<string>(() => loadActiveAssemblySetId() ?? BUILTIN_ASSEMBLY_SET_ID);
  const allSets = useMemo(() => [...builtInAssemblySets, ...customSets], [customSets]);
  const builtInByTopic = useMemo(() => {
    return builtInAssemblySets.reduce<Record<string, BuiltInAssemblySet[]>>((acc, set) => {
      const key = set.topic ?? 'core';
      if (!acc[key]) acc[key] = [];
      acc[key].push(set);
      return acc;
    }, {});
  }, []);
  const activeSet = useMemo(
    () => allSets.find((s) => s.id === activeSetId) ?? builtInAssemblySets[0],
    [allSets, activeSetId],
  );
  const questions = activeSet.questions;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [started, setStarted] = useState(false);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);

  const [showAddSetModal, setShowAddSetModal] = useState(false);
  const [newSetJson, setNewSetJson] = useState('');
  const [setValidationErrors, setSetValidationErrors] = useState<string[]>([]);
  const [formatCopied, setFormatCopied] = useState(false);

  // Assembly state
  const [userAssembly, setUserAssembly] = useState<string[]>([]);
  const [usedTokenIndices, setUsedTokenIndices] = useState<number[]>([]);
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // Webcam / MediaPipe state
  const [webcamActive, setWebcamActive] = useState(false);
  const [modelLoading, setModelLoading] = useState(true);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const [resultBadge, setResultBadge] = useState<'CORRECT!' | 'WRONG!' | null>(null);
  const [debugDot, setDebugDot] = useState<{ x: number; y: number } | null>(null);

  // Refs for detection loop
  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isRunningRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const hoveredRef = useRef<number | null>(null);
  const lastPointedRef = useRef<number | null>(null);
  const pointedFramesRef = useRef(0);
  const answeredRef = useRef(false);
  const handleTokenSelectRef = useRef<(index: number) => void>(() => {});
  const handleNextRef = useRef<() => void>(() => {});
  const handlePreviousRef = useRef<() => void>(() => {});
  const badgeTimerRef = useRef<number | null>(null);
  const usedTokenIndicesRef = useRef<number[]>([]);

  // Action button pointing refs
  const hoveredActionRef = useRef<string | null>(null);
  const lastPointedActionRef = useRef<string | null>(null);
  const pointedActionFramesRef = useRef(0);
  const handleUndoRef = useRef<() => void>(() => {});
  const handleClearRef = useRef<() => void>(() => {});
  const handleSubmitRef = useRef<() => void>(() => {});

  // Swipe refs
  const swipeActiveRef = useRef(false);
  const swipeStartXRef = useRef(0);
  const swipeStartYRef = useRef(0);
  const swipeStartTsRef = useRef(0);
  const swipeCooldownUntilRef = useRef(0);

  const safeIndex = Math.max(0, Math.min(currentIndex, Math.max(questions.length - 1, 0)));
  const question = questions[safeIndex];

  useEffect(() => {
    answeredRef.current = answered;
  }, [answered]);

  useEffect(() => {
    usedTokenIndicesRef.current = usedTokenIndices;
  }, [usedTokenIndices]);

  useEffect(() => {
    saveCustomAssemblySets(customSets);
  }, [customSets]);

  useEffect(() => {
    saveActiveAssemblySetId(activeSet.id);
  }, [activeSet.id]);

  const handleCopyFormat = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(ASSEMBLY_FORMAT_PROMPT);
      setFormatCopied(true);
      window.setTimeout(() => setFormatCopied(false), 2000);
    } catch {
      setFormatCopied(false);
    }
  }, []);

  const handleSetChange = useCallback((setId: string) => {
    setSetValidationErrors([]);
    setActiveSetId(setId);
    setCurrentIndex(0);
    setFinished(false);
    setAnswered(false);
    setUserAssembly([]);
    setUsedTokenIndices([]);
    setAnsweredIds([]);
    setScore(0);
    setHoveredIndex(null);
    setHoveredAction(null);
    setResultBadge(null);
  }, []);

  const handleApplyNewSet = useCallback(() => {
    const validation = validateAssemblySetPayload(newSetJson);
    if (!validation.ok) {
      setSetValidationErrors(validation.errors);
      return;
    }
    const nextSet: StoredAssemblyQuestionSet = {
      id: toCustomAssemblySetId(validation.data.name),
      name: validation.data.name,
      description: validation.data.description,
      schemaVersion: validation.data.schemaVersion,
      questions: validation.data.questions,
    };
    setCustomSets((prev) => [...prev, nextSet]);
    setSetValidationErrors([]);
    setShowAddSetModal(false);
    setNewSetJson('');
    handleSetChange(nextSet.id);
  }, [newSetJson, handleSetChange]);

  // --- Swipe helpers ---
  const resetSwipeTracking = useCallback(() => {
    swipeActiveRef.current = false;
    swipeStartTsRef.current = 0;
  }, []);

  const isNaturalSwipePose = useCallback((result: DetectionResult): boolean => {
    if (result.landmarks.length < 21) return false;
    const wrist = result.landmarks[WRIST];
    const middleMcp = result.landmarks[MIDDLE_MCP];
    const indexMcp = result.landmarks[INDEX_MCP];
    const pinkyMcp = result.landmarks[PINKY_MCP];
    const upright = middleMcp.y < wrist.y - 0.01;
    const openHandWidth = Math.abs(indexMcp.x - pinkyMcp.x) > 0.12;
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
      const dxScreen = -(wrist.x - swipeStartXRef.current);
      const dy = Math.abs(wrist.y - swipeStartYRef.current);
      const horizontalEnough = Math.abs(dxScreen) > SWIPE_DISTANCE;
      const mostlyHorizontal = Math.abs(dxScreen) > dy * 1.3;
      if (!horizontalEnough || !mostlyHorizontal) return;
      resetSwipeTracking();
      swipeCooldownUntilRef.current = now + SWIPE_COOLDOWN_MS;
      if (dxScreen > 0) {
        console.log(`${LOG} Swipe RIGHT -> next question`);
        handleNextRef.current();
      } else {
        console.log(`${LOG} Swipe LEFT -> previous question`);
        handlePreviousRef.current();
      }
    },
    [isNaturalSwipePose, resetSwipeTracking],
  );

  // --- Detection result handler ---
  const onDetectionResult = useCallback(
    (result: DetectionResult) => {
      if (result.landmarks.length >= 21) {
        handleSwipeNavigation(result);
      }

      if (answeredRef.current) {
        return;
      }

      if (result.landmarks.length === 0) {
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          setHoveredIndex(null);
        }
        if (hoveredActionRef.current !== null) {
          hoveredActionRef.current = null;
          setHoveredAction(null);
        }
        lastPointedRef.current = null;
        pointedFramesRef.current = 0;
        lastPointedActionRef.current = null;
        pointedActionFramesRef.current = 0;
        return;
      }

      const cameraContainer = document.querySelector('.camera-bubble-container');
      if (!cameraContainer) return;

      const containerRect = cameraContainer.getBoundingClientRect();
      const rawTip = result.landmarks[INDEX_FINGERTIP];
      const dip = result.landmarks[INDEX_DIP];
      const extendedTip = {
        x: rawTip.x + (rawTip.x - dip.x) * TIP_EXTEND,
        y: rawTip.y + (rawTip.y - dip.y) * TIP_EXTEND,
        z: rawTip.z,
      };
      const screenPos = landmarkToScreen(extendedTip, containerRect, true);

      // Debug: show where MediaPipe thinks the fingertip is
      setDebugDot({
        x: screenPos.x - containerRect.left,
        y: screenPos.y - containerRect.top,
      });

      // Check token pills — use hit-test (fingertip must be inside the pill rect)
      const fieldEl = cameraContainer.querySelector('[data-code-assembly-token-field]');
      const allPillEls = fieldEl
        ? (Array.from(fieldEl.querySelectorAll('.token-pill')) as HTMLElement[])
        : [];
      const visiblePills = allPillEls.filter((el) => !el.classList.contains('token-pill--used'));

      // Hit-test: find which visible pill the fingertip is actually touching
      const HIT_PAD = 18; // px of forgiveness around each pill edge
      let touchedVisibleIdx = -1;
      for (let i = 0; i < visiblePills.length; i++) {
        const r = visiblePills[i].getBoundingClientRect();
        if (
          screenPos.x >= r.left - HIT_PAD &&
          screenPos.x <= r.right + HIT_PAD &&
          screenPos.y >= r.top - HIT_PAD &&
          screenPos.y <= r.bottom + HIT_PAD
        ) {
          touchedVisibleIdx = i;
          break;
        }
      }

      // Hover glow uses tighter proximity so only one pill glows
      const closestPill = findClosestBubble(screenPos, visiblePills, 70);

      // Check action buttons (proximity-based, they're small)
      const actionBtns = Array.from(
        cameraContainer.querySelectorAll('.action-btn-pointable:not(:disabled)'),
      ) as HTMLElement[];
      const closestAction = findClosestBubble(screenPos, actionBtns, 80);

      // Map visible-pill index back to the full token array index
      const mapToFullIndex = (visIdx: number): number => {
        if (visIdx < 0 || visIdx >= visiblePills.length) return -1;
        return allPillEls.indexOf(visiblePills[visIdx]);
      };

      // Determine hover target (proximity-based for glow)
      let pillDist = Infinity;
      let actionDist = Infinity;
      if (closestPill >= 0) {
        const r = visiblePills[closestPill].getBoundingClientRect();
        pillDist = Math.hypot(screenPos.x - (r.left + r.width / 2), screenPos.y - (r.top + r.height / 2));
      }
      if (closestAction >= 0) {
        const r = actionBtns[closestAction].getBoundingClientRect();
        actionDist = Math.hypot(screenPos.x - (r.left + r.width / 2), screenPos.y - (r.top + r.height / 2));
      }

      const preferToken = pillDist <= actionDist;

      if (preferToken && closestPill >= 0) {
        // Show hover glow on the closest pill (proximity)
        const hoverMapped = mapToFullIndex(closestPill);

        if (hoverMapped !== hoveredRef.current) {
          hoveredRef.current = hoverMapped;
          setHoveredIndex(hoverMapped === -1 ? null : hoverMapped);
        }
        if (hoveredActionRef.current !== null) {
          hoveredActionRef.current = null;
          setHoveredAction(null);
        }
        lastPointedActionRef.current = null;
        pointedActionFramesRef.current = 0;

        // Selection requires actual touch (hit-test) + Pointing_Up gesture
        const touchedMapped = mapToFullIndex(touchedVisibleIdx);

        if (touchedMapped < 0) {
          lastPointedRef.current = null;
          pointedFramesRef.current = 0;
          return;
        }

        if (lastPointedRef.current !== touchedMapped) {
          lastPointedRef.current = touchedMapped;
          pointedFramesRef.current = 0;
        }

        // Finger touching the pill + Pointing_Up gesture → select (once)
        const isPointing = result.gesture === 'Pointing_Up';
        if (isPointing && !usedTokenIndicesRef.current.includes(touchedMapped)) {
          console.log(`${LOG} Pointing finger touching token ${touchedMapped} -> selecting`);
          handleTokenSelectRef.current(touchedMapped);
          usedTokenIndicesRef.current = [...usedTokenIndicesRef.current, touchedMapped];
        }
      } else if (closestAction >= 0) {
        // Hovering an action button
        const actionName = actionBtns[closestAction].getAttribute('data-action') ?? null;

        if (actionName !== hoveredActionRef.current) {
          hoveredActionRef.current = actionName;
          setHoveredAction(actionName);
        }
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          setHoveredIndex(null);
        }
        lastPointedRef.current = null;
        pointedFramesRef.current = 0;

        const isPointing = result.gesture === 'Pointing_Up';

        if (!actionName) {
          lastPointedActionRef.current = null;
          pointedActionFramesRef.current = 0;
          return;
        }

        if (lastPointedActionRef.current !== actionName) {
          lastPointedActionRef.current = actionName;
          pointedActionFramesRef.current = 0;
        }

        if (isPointing) {
          pointedActionFramesRef.current += 1;
        }

        if (pointedActionFramesRef.current >= POINT_CONFIRM_FRAMES) {
          console.log(`${LOG} Pointing at action "${actionName}" -> triggering`);
          if (actionName === 'undo') handleUndoRef.current();
          else if (actionName === 'clear') handleClearRef.current();
          else if (actionName === 'submit') handleSubmitRef.current();
          
          // Reset action frames so it doesn't spam-click the button
          lastPointedActionRef.current = null;
          pointedActionFramesRef.current = 0;
        }
      } else {
        // Nothing close
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          setHoveredIndex(null);
        }
        if (hoveredActionRef.current !== null) {
          hoveredActionRef.current = null;
          setHoveredAction(null);
        }
        lastPointedRef.current = null;
        pointedFramesRef.current = 0;
        lastPointedActionRef.current = null;
        pointedActionFramesRef.current = 0;
      }
    },
    [handleSwipeNavigation],
  );

  // --- Boot webcam + gesture recognizer ---
  useEffect(() => {
    let cancelled = false;
    const bootStart = performance.now();
    console.log(`${LOG} Boot sequence starting...`);

    async function boot() {
      try {
        console.log(`${LOG} Step 1/3: Initializing gesture recognizer...`);
        recognizerRef.current = await initGestureRecognizer();
        if (cancelled) return;

        console.log(`${LOG} Step 2/3: Starting camera...`);
        const video = videoRef.current;
        if (!video) {
          console.error(`${LOG} Video element ref is null`);
          return;
        }
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
        setModelLoading(false);
        isRunningRef.current = true;
        runDetectionLoop(recognizerRef.current, video, onDetectionResult, isRunningRef);

        const elapsed = (performance.now() - bootStart).toFixed(0);
        console.log(`${LOG} Boot complete in ${elapsed}ms`);
      } catch (err) {
        console.error(`${LOG} Boot failed:`, err);
        if (!cancelled) {
          setModelLoading(false);
          setWebcamError('Camera access denied or unavailable. Use click/tap to select tokens.');
        }
      }
    }

    boot();

    return () => {
      cancelled = true;
      isRunningRef.current = false;
      stopCamera(streamRef.current, animFrameRef.current);
      streamRef.current = null;
      resetSwipeTracking();
      if (badgeTimerRef.current !== null) {
        window.clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = null;
      }
    };
  }, [onDetectionResult, resetSwipeTracking]);

  // --- Token selection ---
  const handleTokenSelect = useCallback(
    (tokenIndex: number) => {
      if (answered || usedTokenIndices.includes(tokenIndex)) return;

      const newAssembly = [...userAssembly, question.tokens[tokenIndex]];
      const newUsed = [...usedTokenIndices, tokenIndex];

      flushSync(() => {
        setUserAssembly(newAssembly);
        setUsedTokenIndices(newUsed);
      });

      const matchFound = question.validAnswers.some((valid) =>
        arraysEqual(newAssembly, valid),
      );

      if (matchFound) {
        answeredRef.current = true;
        setAnswered(true);
        setIsCorrect(true);
        const alreadyAnswered = answeredIds.includes(question.id);
        if (!alreadyAnswered) {
          setScore((s) => s + 1);
          setAnsweredIds((ids) => [...ids, question.id]);
        }
        setResultBadge('CORRECT!');
        if (badgeTimerRef.current !== null) window.clearTimeout(badgeTimerRef.current);
        badgeTimerRef.current = window.setTimeout(() => {
          setResultBadge(null);
          badgeTimerRef.current = null;
        }, 1500);
      }
    },
    [answered, usedTokenIndices, userAssembly, question, answeredIds],
  );

  useEffect(() => {
    handleTokenSelectRef.current = handleTokenSelect;
  }, [handleTokenSelect]);

  // Keyboard fallback: press 1-9 to select token by index
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!started || answered) return;
      const digit = parseInt(e.key);
      if (digit >= 1 && digit <= question.tokens.length) {
        e.preventDefault();
        handleTokenSelect(digit - 1);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [started, answered, question.tokens.length, handleTokenSelect]);

  const handleSubmit = useCallback(() => {
    if (answered) return;
    const matchFound = question.validAnswers.some((valid) =>
      arraysEqual(userAssembly, valid),
    );
    answeredRef.current = true;
    setAnswered(true);
    setIsCorrect(matchFound);

    if (matchFound) {
      const alreadyAnswered = answeredIds.includes(question.id);
      if (!alreadyAnswered) {
        setScore((s) => s + 1);
        setAnsweredIds((ids) => [...ids, question.id]);
      }
    }

    setResultBadge(matchFound ? 'CORRECT!' : 'WRONG!');
    if (badgeTimerRef.current !== null) window.clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = window.setTimeout(() => {
      setResultBadge(null);
      badgeTimerRef.current = null;
    }, 1500);
  }, [answered, question, userAssembly, answeredIds]);

  const handleUndo = useCallback(() => {
    if (answered || userAssembly.length === 0) return;
    setUserAssembly((prev) => prev.slice(0, -1));
    setUsedTokenIndices((prev) => prev.slice(0, -1));
  }, [answered, userAssembly.length]);

  const handleClearAssembly = useCallback(() => {
    if (answered) return;
    setUserAssembly([]);
    setUsedTokenIndices([]);
  }, [answered]);

  useEffect(() => {
    handleUndoRef.current = handleUndo;
    handleClearRef.current = handleClearAssembly;
    handleSubmitRef.current = handleSubmit;
  }, [handleUndo, handleClearAssembly, handleSubmit]);

  // --- Navigation ---
  const resetQuestion = useCallback(() => {
    answeredRef.current = false;
    setAnswered(false);
    setIsCorrect(false);
    setUserAssembly([]);
    setUsedTokenIndices([]);
    setHoveredIndex(null);
    setHoveredAction(null);
    setResultBadge(null);
    hoveredRef.current = null;
    hoveredActionRef.current = null;
    lastPointedRef.current = null;
    pointedFramesRef.current = 0;
    lastPointedActionRef.current = null;
    pointedActionFramesRef.current = 0;
    resetSwipeTracking();
    if (badgeTimerRef.current !== null) {
      window.clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = null;
    }
  }, [resetSwipeTracking]);

  const handleNext = useCallback(() => {
    const next = currentIndex + 1;
    if (next >= questions.length) {
      setFinished(true);
    } else {
      setCurrentIndex(next);
      resetQuestion();
    }
  }, [currentIndex, resetQuestion]);

  const handlePrevious = useCallback(() => {
    if (currentIndex <= 0) return;
    setCurrentIndex(currentIndex - 1);
    resetQuestion();
  }, [currentIndex, resetQuestion]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setScore(0);
    setFinished(false);
    setAnsweredIds([]);
    resetQuestion();
  }, [resetQuestion]);

  useEffect(() => {
    handleNextRef.current = handleNext;
    handlePreviousRef.current = handlePrevious;
  }, [handleNext, handlePrevious]);

  // --- Render ---
  if (finished) {
    return (
      <div className="review-container code-assembly-container">
        <div className="review-dataset-card">
          <p className="review-dataset-title">{activeSet.name}</p>
          <p className="review-dataset-description">{activeSet.description}</p>
        </div>
        <div className="review-finished">
          <h2>Code Assembly Complete</h2>
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
    <div className="review-container code-assembly-container">
      <div className="review-dataset-controls">
        <div className="review-dataset-picker">
          <label htmlFor="assembly-set-select">Question set</label>
          <select
            id="assembly-set-select"
            value={activeSetId}
            onChange={(e) => handleSetChange(e.target.value)}
          >
            {Object.entries(builtInByTopic).map(([topic, sets]) => (
              <optgroup key={topic} label={ASSEMBLY_TOPIC_LABELS[topic] ?? topic}>
                {sets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} (Built-in)</option>
                ))}
              </optgroup>
            ))}
            {customSets.length > 0 && (
              <optgroup label="Custom Sets">
                {customSets.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} (Custom)</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => { setSetValidationErrors([]); setShowAddSetModal(true); }}
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

      {/* Assembled code display */}
      <div className="assembly-display">
        <code className="assembly-code">
          {userAssembly.length > 0
            ? userAssembly.join(' ')
            : '\u00A0'}
        </code>
        {!answered && (
          <div className="assembly-actions">
            <button
              className="btn btn-sm btn-outline"
              onClick={handleUndo}
              disabled={userAssembly.length === 0}
            >
              Undo
            </button>
            <button
              className="btn btn-sm btn-outline"
              onClick={handleClearAssembly}
              disabled={userAssembly.length === 0}
            >
              Clear
            </button>
            <button
              className="btn btn-sm"
              onClick={handleSubmit}
              disabled={userAssembly.length === 0}
            >
              Submit
            </button>
          </div>
        )}
      </div>

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
            <TokenField
              questionKey={question.id}
              tokens={question.tokens}
              usedIndices={usedTokenIndices}
              hoveredIndex={hoveredIndex}
              disabled={answered}
              onSelect={handleTokenSelect}
            />
          </div>
        )}

        {!modelLoading && started && !answered && (
          <div className="assembly-viewport-actions">
            <button
              className={`action-btn-pointable${hoveredAction === 'undo' ? ' action-btn-pointable--hovered' : ''}`}
              data-action="undo"
              onClick={handleUndo}
              disabled={userAssembly.length === 0}
            >
              Undo
            </button>
            <button
              className={`action-btn-pointable${hoveredAction === 'clear' ? ' action-btn-pointable--hovered' : ''}`}
              data-action="clear"
              onClick={handleClearAssembly}
              disabled={userAssembly.length === 0}
            >
              Clear
            </button>
            <button
              className={`action-btn-pointable action-btn-pointable--submit${hoveredAction === 'submit' ? ' action-btn-pointable--hovered' : ''}`}
              data-action="submit"
              onClick={handleSubmit}
              disabled={userAssembly.length === 0}
            >
              Submit
            </button>
          </div>
        )}

        {debugDot && started && (
          <div
            className="debug-fingertip-dot"
            style={{
              left: debugDot.x,
              top: debugDot.y,
            }}
          />
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

      {started && !finished && (
        <div className="review-nav-actions review-nav-actions--always">
          <button
            className="btn btn-outline"
            onClick={handlePrevious}
            disabled={safeIndex === 0}
          >
            Previous
          </button>
          <button className="btn" onClick={handleNext}>
            Next
          </button>
        </div>
      )}

      {answered && (
        <div className="review-explanation">
          <p className={isCorrect ? 'review-result--correct' : 'review-result--incorrect'}>
            {isCorrect ? 'CORRECT!' : 'Incorrect'}
          </p>
          {!isCorrect && (
            <p className="assembly-valid-answer">
              Valid answer: <code>{question.validAnswers[0].join(' ')}</code>
            </p>
          )}
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
              Previous
            </button>
            <button className="btn" onClick={handleNext}>
              Next
            </button>
          </div>
        </div>
      )}

      <PoweredBy />

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
                  <li>At the top of the copied text you&apos;ll see <strong>Topic:</strong> and <strong>Description:</strong>. Replace the brackets with what you want to study (e.g. &quot;World War II&quot; or &quot;Spanish vocabulary&quot;).</li>
                  <li>Paste the whole text into the chatbot and send it. The chatbot will reply with a block of text.</li>
                  <li>Copy everything the chatbot gives you — you&apos;ll need it for Step 2.</li>
                </ol>
                <div className="review-format-block">
                  <pre className="review-format-pre">{ASSEMBLY_FORMAT_PROMPT}</pre>
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
                <label htmlFor="assembly-paste-box" className="review-json-label">Paste what the chatbot gave you here:</label>
                <textarea
                  id="assembly-paste-box"
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
              <button type="button" className="btn" onClick={handleApplyNewSet}>
                Add questions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
