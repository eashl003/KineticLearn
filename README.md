# Interactive Technical Interview Prep

A fully client-side React app for practicing technical interview questions using hand gestures, speech recognition, and an in-browser AI coach. No backend, no database — everything runs locally in your browser.

**Live demo:** [https://eashl003.github.io/KineticLearn/](https://eashl003.github.io/KineticLearn/)

## Features

### Review Mode — "Pop the Bubble"

- Multiple-choice Python questions displayed as floating bubbles over your live webcam feed.
- **Point** at the correct bubble with your index finger to select an answer (MediaPipe hand tracking).
- **Swipe** your hand left/right after answering to navigate between questions.
- Click/tap fallback if webcam is unavailable.
- Animated bubbles with Framer Motion (float, pop, correct/incorrect feedback).
- Import your own question sets by pasting JSON — validated and stored in localStorage.
- Switch between built-in and custom question sets via a dropdown.
- Progress is saved per question set across browser sessions.

### Problems Mode — Coding Practice

- Real coding problems (Two Sum, Valid Parentheses, Merge Intervals, etc.) with prompt, constraints, and examples.
- **Sketch pad** for drawing pseudocode or diagrams (touch-friendly canvas).
- **"Think out loud"** panel with speech-to-text recording (Web Speech API) or typed input.
- **VS Code-style code editor** with line numbers, tab/enter handling, and monospace font.
- **Evidence panel** that bundles your transcript + sketch for review, with PNG/JSON export.
- **AI Feedback** powered by an in-browser LLM (Phi-3-mini via WebLLM/WebGPU) — streaming responses with conversational follow-up.
- **Show Solution** with explanation for each problem.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TypeScript |
| Build | Vite |
| Routing | React Router v7 (HashRouter for GitHub Pages) |
| Hand tracking | MediaPipe Gesture Recognizer (`@mediapipe/tasks-vision`) |
| Animations | Framer Motion |
| Speech-to-text | Web Speech API (browser-native) |
| AI feedback | WebLLM (`@mlc-ai/web-llm`) — Phi-3-mini running in-browser via WebGPU |
| Hosting | GitHub Pages (static) |
| Persistence | localStorage |

## Privacy

- Hand tracking runs **entirely in your browser** via MediaPipe WASM/WebGPU. No video leaves your device.
- AI feedback runs **in-browser** via WebLLM. No data is sent to any server.
- Speech recognition uses the browser's built-in Web Speech API, which may use vendor cloud services depending on your browser.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- A browser with WebGPU support (Chrome 113+, Edge 113+) for AI feedback

### Install and run locally

```bash
git clone https://github.com/eashl003/KineticLearn.git
cd KineticLearn
npm install
npm run dev
```

Open [http://localhost:5173/KineticLearn/](http://localhost:5173/KineticLearn/) in your browser.

### Build for production

```bash
npm run build
```

Output is in `dist/`.

## Deploy to GitHub Pages

The project is pre-configured for GitHub Pages deployment.

```bash
npm run deploy
```

This runs `npm run build` automatically, then pushes the `dist/` folder to the `gh-pages` branch.

To set up GitHub Pages for the first time:

1. Go to your repo on GitHub → **Settings** → **Pages**.
2. Under **Source**, select **Deploy from a branch**.
3. Set branch to `gh-pages` and folder to `/ (root)`.
4. Click **Save**.

Your app will be live at `https://<username>.github.io/KineticLearn/`.

## Adding Custom Question Sets

On the Review page, click **Add new questions** and paste JSON in this format:

```json
{
  "schemaVersion": 1,
  "name": "My Question Set",
  "description": "A short description of the set.",
  "questions": [
    {
      "id": "unique-id-001",
      "topic": "python-basics",
      "question": "Your question here?",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "answerIndex": 2,
      "explanation": "Why Option C is correct."
    }
  ]
}
```

Requirements:
- `name` and `description` are required strings.
- Each question must have exactly **4 choices**.
- `answerIndex` is 0-based (0–3).
- All question `id` values must be unique within the set.

Custom sets are stored in `localStorage` and persist across sessions.

## Project Structure

```
src/
├── app/                  # App entry, router
├── components/
│   ├── layout/           # Header, shell
│   ├── review/           # ReviewContainer, BubbleField, Bubble, PoweredBy
│   └── problems/         # SketchCanvas, SpeechPanel, CodeEditor,
│                         # EvidencePanel, FeedbackPanel, NotesPanel
├── data/                 # Built-in question/problem JSON files
├── lib/
│   ├── mediapipe/        # Gesture recognizer, camera, coordinate mapping
│   ├── evaluate/         # LLM integration (WebLLM)
│   └── storage/          # localStorage helpers
├── pages/                # Route-level page components
└── styles/               # Global CSS
```

## License

Open source. See [LICENSE](LICENSE) for details.
