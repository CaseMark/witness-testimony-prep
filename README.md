# 🎯 Testimony Prep Tool

A powerful witness preparation tool that helps attorneys prepare witnesses for cross-examination using AI-generated questions and interactive practice sessions.

## Features

- **📄 Document Upload**: Upload case materials (depositions, exhibits, witness statements) that the witness will be questioned about
- **🤖 AI Question Generation**: Automatically generate 20 likely cross-examination questions based on uploaded documents
- **🎭 Practice Mode**: Interactive Q&A practice with an AI examiner that provides realistic follow-up questions
- **💡 Response Coaching**: Get feedback on witness responses with suggestions for improvement
- **⚠️ Weak Point Identification**: Highlights areas where testimony might be vulnerable
- **⏱️ Session Timer**: Track practice session duration
- **🎙️ Recording Support**: Optional session recording for attorney review (Voice API integration)

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **APIs**: Case.dev (Vaults, LLMs, Voice)

## Case.dev APIs Used

| API | Purpose |
|-----|---------|
| **Vaults** | Secure document storage with OCR and semantic search |
| **LLMs** | Question generation and AI examiner responses |
| **Voice** | Session recording and transcription (optional) |

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm
- Case.dev API key ([Get one here](https://app.case.dev))

### Installation

1. Clone the repository:
```bash
cd testimony-prep
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Add your Case.dev API key to `.env.local`:
```
CASEDEV_API_KEY=sk_case_your_api_key_here
```

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Question Categories

| Category | Description |
|----------|-------------|
| **Timeline** | Questions about sequence and timing of events |
| **Credibility** | Questions challenging witness reliability |
| **Inconsistency** | Questions highlighting contradictions |
| **Foundation** | Questions establishing basis for knowledge |
| **Impeachment** | Questions using prior statements or conduct |
| **General** | Standard cross-examination questions |

## Project Structure

```
testimony-prep/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── sessions/
│   │   │       ├── route.ts              # Create/list sessions
│   │   │       └── [sessionId]/
│   │   │           ├── route.ts          # Get/update/delete session
│   │   │           ├── documents/
│   │   │           │   └── route.ts      # Upload documents
│   │   │           ├── generate-questions/
│   │   │           │   └── route.ts      # Generate cross-exam questions
│   │   │           └── practice/
│   │   │               └── route.ts      # Practice mode API
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                      # Main UI component
│   └── lib/
│       ├── case-api.ts                   # Case.dev API client
│       ├── session-store.ts              # In-memory session storage
│       └── types.ts                      # TypeScript types
├── .env.example
├── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sessions` | Create a new prep session |
| GET | `/api/sessions` | List all sessions |
| GET | `/api/sessions/:id` | Get session details |
| PATCH | `/api/sessions/:id` | Update session |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/documents` | Upload document |
| GET | `/api/sessions/:id/documents` | List documents |
| POST | `/api/sessions/:id/generate-questions` | Generate cross-exam questions |
| POST | `/api/sessions/:id/practice` | Submit practice response |
| GET | `/api/sessions/:id/practice` | Get practice history |

## Future Enhancements

- [ ] Video practice with body language analysis
- [ ] Attorney feedback loop and annotations
- [ ] Multi-witness case preparation
- [ ] Export practice sessions as PDF reports
- [ ] Integration with case management systems
- [ ] Real-time voice practice with speech-to-text

## License

MIT

## Support

For questions about Case.dev APIs, visit [docs.case.dev](https://docs.case.dev)
