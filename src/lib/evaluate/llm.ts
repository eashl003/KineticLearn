import * as webllm from '@mlc-ai/web-llm';

let engineInstance: webllm.MLCEngine | null = null;

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export async function initLLMEngine(
  onProgress: (progress: webllm.InitProgressReport) => void,
): Promise<webllm.MLCEngine> {
  if (engineInstance) {
    return engineInstance;
  }

  const selectedModel = 'Phi-3-mini-4k-instruct-q4f16_1-MLC';

  engineInstance = await webllm.CreateMLCEngine(selectedModel, {
    initProgressCallback: onProgress,
  });

  return engineInstance;
}

export function buildSystemPrompt(
  problemPrompt: string,
  expectedPatterns: string[],
): string {
  return `You are an expert technical interview coach having a conversation with a candidate.
The candidate is solving the following problem:
"${problemPrompt}"

Expected patterns or concepts for a good solution: ${expectedPatterns.join(', ')}

When giving initial feedback, provide 3 short constructive bullet points (prefixed with a dash).
When the candidate asks follow-up questions, answer conversationally — be helpful, encouraging, and technical.
Keep answers concise (2-4 sentences for follow-ups).`;
}

export function buildQuestionGenPrompt(
  topic: string,
  description: string,
): string {
  return `You are a technical interview question generator.

Generate a JSON object for a review question set on the topic: "${topic}"
Description: "${description}"

The JSON must have this exact structure (no extra keys, no markdown, no explanation — ONLY raw JSON):
{
  "schemaVersion": 1,
  "name": "<short set name based on topic>",
  "description": "<1 sentence description>",
  "questions": [
    {
      "id": "<unique-kebab-id>",
      "topic": "<topic-slug>",
      "question": "<question text>",
      "choices": ["<option A>", "<option B>", "<option C>", "<option D>"],
      "answerIndex": <0|1|2|3>,
      "explanation": "<1-2 sentence explanation of the correct answer>"
    }
  ]
}

Rules:
- Generate between 5 and 10 questions.
- Each question MUST have exactly 4 choices.
- answerIndex is 0-based (0 to 3).
- Every question id must be unique.
- Output ONLY the JSON object. No markdown fences, no commentary, no text before or after.`;
}

export async function streamChat(
  engine: webllm.MLCEngine,
  messages: ChatMessage[],
  onChunk: (partialText: string) => void,
  maxTokens = 400,
): Promise<string> {
  const chunks = await engine.chat.completions.create({
    messages,
    temperature: 0.7,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  });

  let full = '';
  for await (const chunk of chunks) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      full += delta;
      onChunk(full);
    }
  }
  return full;
}
