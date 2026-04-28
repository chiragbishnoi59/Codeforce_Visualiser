# Codeforces Analyzer

Codeforces Analyzer is a React dashboard that evaluates a user's public Codeforces history and now provides:

- daily 5 problem recommendations
- weak-topic practice signals
- optional Groq AI coaching notes (Gemini fallback)

The app works for free by default using deterministic recommendation logic. AI is optional and can be turned on with an API key.

## What is New

- Daily planner that suggests 5 unsolved problems based on rating progression and weak tags
- Topics to practice section with actionable reasons and practice tips
- Weekly focus summary (rule-based by default, AI-enhanced when enabled)
- Redesigned dashboard UI with improved hierarchy, motion, and responsive layout
- Accessibility improvements for alerts, labels, and chart semantics

## How Recommendations Work

### Free mode (default)

1. Fetch accepted submissions and deduplicate solved problems.
2. Build topic exposure signals:
   - total solved count per tag
   - recent (last 30 solves) count per tag
3. Compute weak-topic score from low volume + low recency.
4. Fetch and cache Codeforces problemset locally (24h cache).
5. Select 5 unsolved problems close to the target rating with weak-topic overlap.

### Optional AI mode

When enabled, Groq (or Gemini fallback) can:

- generate a short weekly focus summary
- add compact tips for weak topics
- provide short reasons per recommended problem

If AI fails (missing key/quota/API error), the app automatically falls back to free deterministic explanations.

## Tech Stack

- React 19
- Tailwind CSS 3
- Codeforces public API

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Optional AI key

Copy `.env.example` to `.env` and set:

```bash
REACT_APP_GROQ_API_KEY=your_key_here

# Optional
REACT_APP_GROQ_BASE_URL=https://api.groq.com/openai/v1
REACT_APP_GROQ_MODEL=llama-3.1-8b-instant

# Optional fallback provider
REACT_APP_GEMINI_API_KEY=your_gemini_key_here
```

If omitted, the app still works fully in free mode.

### 3. Start development server

```bash
npm start
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
```

## Deploy (GitHub Pages)

```bash
npm run deploy
```

## API Endpoints Used

- `https://codeforces.com/api/user.info`
- `https://codeforces.com/api/user.status`
- `https://codeforces.com/api/user.rating`
- `https://codeforces.com/api/problemset.problems`

## Project Structure

- `src/App.jsx` - app orchestration, state, and UI sections
- `src/utils/codeforces.js` - API helpers + problemset cache
- `src/utils/recommendationEngine.js` - weak-topic and daily-pick logic
- `src/services/ai.js` - optional Groq/Gemini coaching integration
- `src/tailwind.css` - global visual language and reusable UI classes

## Notes

- Codeforces API limits and availability can affect response times.
- First-time recommendation generation may take longer because `problemset.problems` is large.
- Cached problemset is reused for 24 hours to improve performance.
