/**
 * Question registry: static imports of all built-in multiple-choice question sets.
 * Vite bundles these at build time. Old review_questions.json is first for backward compatibility.
 */

import reviewQuestionsData from './review_questions.json';

import arrays from './python_review/data_structures/arrays.json';
import dictionaries from './python_review/data_structures/dictionaries.json';
import sets from './python_review/data_structures/sets.json';
import tuples from './python_review/data_structures/tuples.json';

import sorting from './python_review/algorithms/sorting.json';
import searching from './python_review/algorithms/searching.json';
import recursion from './python_review/algorithms/recursion.json';
import dynamicProgramming from './python_review/algorithms/dynamic_programming.json';
import greedy from './python_review/algorithms/greedy.json';
import slidingWindow from './python_review/algorithms/sliding_window.json';
import twoPointers from './python_review/algorithms/two_pointers.json';

import strings from './python_review/data_types/strings.json';
import numbers from './python_review/data_types/numbers.json';
import booleans from './python_review/data_types/booleans.json';
import mutability from './python_review/data_types/mutability.json';

import frequencyCounting from './python_review/hash_maps/frequency_counting.json';
import memoization from './python_review/hash_maps/memoization.json';
import lookupPatterns from './python_review/hash_maps/lookup_patterns.json';

import timeComplexity from './python_review/complexity/time_complexity.json';
import spaceComplexity from './python_review/complexity/space_complexity.json';
import bigO from './python_review/complexity/big_o.json';

import listComprehensions from './python_review/pythonic_patterns/list_comprehensions.json';
import dictComprehensions from './python_review/pythonic_patterns/dict_comprehensions.json';
import lambdaMapFilter from './python_review/pythonic_patterns/lambda_map_filter.json';

import exceptions from './python_review/error_handling/exceptions.json';
import edgeCases from './python_review/error_handling/edge_cases.json';

export interface ReviewQuestionSet {
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
  source: 'built-in';
  /** Topic key for grouping in the selector (e.g. data_structures, algorithms). */
  topic?: string;
}

interface QuestionFile {
  schemaVersion: number;
  name?: string;
  description?: string;
  language?: string;
  topic?: string;
  questions: ReviewQuestionSet['questions'];
}

function toSet(file: QuestionFile, id: string, topic?: string): ReviewQuestionSet {
  return {
    id,
    name: file.name ?? 'Unnamed Set',
    description: file.description ?? '',
    schemaVersion: file.schemaVersion ?? 1,
    questions: file.questions ?? [],
    source: 'built-in',
    topic,
  };
}

const BUILT_IN_CORE_ID = 'built-in-python-core';

const pythonCoreSet: ReviewQuestionSet = {
  ...toSet(reviewQuestionsData as QuestionFile, BUILT_IN_CORE_ID, 'core'),
  name: 'Python Core Review',
  description: 'Default interview prep question set bundled with the app.',
};

const topicSets: ReviewQuestionSet[] = [
  toSet(arrays as QuestionFile, 'builtin-python-data_structures-arrays', 'data_structures'),
  toSet(dictionaries as QuestionFile, 'builtin-python-data_structures-dictionaries', 'data_structures'),
  toSet(sets as QuestionFile, 'builtin-python-data_structures-sets', 'data_structures'),
  toSet(tuples as QuestionFile, 'builtin-python-data_structures-tuples', 'data_structures'),
  toSet(sorting as QuestionFile, 'builtin-python-algorithms-sorting', 'algorithms'),
  toSet(searching as QuestionFile, 'builtin-python-algorithms-searching', 'algorithms'),
  toSet(recursion as QuestionFile, 'builtin-python-algorithms-recursion', 'algorithms'),
  toSet(dynamicProgramming as QuestionFile, 'builtin-python-algorithms-dynamic_programming', 'algorithms'),
  toSet(greedy as QuestionFile, 'builtin-python-algorithms-greedy', 'algorithms'),
  toSet(slidingWindow as QuestionFile, 'builtin-python-algorithms-sliding_window', 'algorithms'),
  toSet(twoPointers as QuestionFile, 'builtin-python-algorithms-two_pointers', 'algorithms'),
  toSet(strings as QuestionFile, 'builtin-python-data_types-strings', 'data_types'),
  toSet(numbers as QuestionFile, 'builtin-python-data_types-numbers', 'data_types'),
  toSet(booleans as QuestionFile, 'builtin-python-data_types-booleans', 'data_types'),
  toSet(mutability as QuestionFile, 'builtin-python-data_types-mutability', 'data_types'),
  toSet(frequencyCounting as QuestionFile, 'builtin-python-hash_maps-frequency_counting', 'hash_maps'),
  toSet(memoization as QuestionFile, 'builtin-python-hash_maps-memoization', 'hash_maps'),
  toSet(lookupPatterns as QuestionFile, 'builtin-python-hash_maps-lookup_patterns', 'hash_maps'),
  toSet(timeComplexity as QuestionFile, 'builtin-python-complexity-time_complexity', 'complexity'),
  toSet(spaceComplexity as QuestionFile, 'builtin-python-complexity-space_complexity', 'complexity'),
  toSet(bigO as QuestionFile, 'builtin-python-complexity-big_o', 'complexity'),
  toSet(listComprehensions as QuestionFile, 'builtin-python-pythonic_patterns-list_comprehensions', 'pythonic_patterns'),
  toSet(dictComprehensions as QuestionFile, 'builtin-python-pythonic_patterns-dict_comprehensions', 'pythonic_patterns'),
  toSet(lambdaMapFilter as QuestionFile, 'builtin-python-pythonic_patterns-lambda_map_filter', 'pythonic_patterns'),
  toSet(exceptions as QuestionFile, 'builtin-python-error_handling-exceptions', 'error_handling'),
  toSet(edgeCases as QuestionFile, 'builtin-python-error_handling-edge_cases', 'error_handling'),
];

/** All built-in question sets: legacy Python Core first, then by topic. */
export const builtInSets: ReviewQuestionSet[] = [pythonCoreSet, ...topicSets];

/** Resolve a built-in set by id. */
export function getBuiltInSetById(id: string): ReviewQuestionSet | undefined {
  return builtInSets.find((s) => s.id === id);
}

/** Topic key to display label for optgroup. */
export const TOPIC_LABELS: Record<string, string> = {
  core: 'Python Core',
  data_structures: 'Data Structures',
  algorithms: 'Algorithms',
  data_types: 'Data Types',
  hash_maps: 'Hash Maps',
  complexity: 'Complexity',
  pythonic_patterns: 'Pythonic Patterns',
  error_handling: 'Error Handling',
};
