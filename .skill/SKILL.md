---
name: witness-testimony-prep
description: |
  Development skill for CaseMark's Witness Testimony Prep Tool - an AI-powered 
  application for preparing witnesses for cross-examination with generated questions, 
  interactive practice sessions, and response coaching. Built with Next.js 15 and 
  Case.dev APIs (Vaults, LLMs, Voice). Use this skill when: (1) Working on the 
  witness-testimony-prep codebase, (2) Implementing question generation or practice 
  mode features, (3) Integrating Case.dev Vaults/LLMs/Voice APIs, or (4) Building 
  session management and feedback features.
---

# Witness Testimony Prep Development Guide

An AI-powered tool for preparing witnesses for cross-examination with document-based question generation, interactive practice, and coaching feedback.

**Live site**: https://witness-testimony-prep.casedev.app

## Architecture

```
src/
├── app/
│   ├── api/sessions/
│   │   ├── route.ts                    # Create/list sessions
│   │   └── [sessionId]/
│   │       ├── route.ts                # Get/update/delete
│   │       ├── documents/              # Upload case materials
│   │       ├── generate-questions/     # Generate cross-exam Qs
│   │       └── practice/               # Practice mode API
│   └── page.tsx                        # Main UI
└── lib/
    ├── case-api.ts                     # Case.dev client
    ├── session-store.ts                # In-memory storage
    └── types.ts                        # TypeScript types
```

## Core Workflow

```
Create Session → Upload Docs → Generate Questions → Practice → Review
       ↓              ↓              ↓                 ↓          ↓
  Witness info   Depositions,    AI creates 20    Interactive  Coaching
  case context   exhibits,       likely cross-    Q&A with     feedback,
                 statements      exam questions   AI examiner  weak points
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React, Tailwind CSS |
| Backend | Next.js API Routes |
| Document Storage | Case.dev Vaults (OCR, semantic search) |
| AI | Case.dev LLMs (question generation, practice) |
| Recording | Case.dev Voice API (optional) |

## Key Features

| Feature | Description |
|---------|-------------|
| Document Upload | Depositions, exhibits, witness statements |
| Question Generation | 20 likely cross-examination questions |
| Practice Mode | Interactive Q&A with AI examiner |
| Response Coaching | Feedback with improvement suggestions |
| Weak Point ID | Highlights vulnerable testimony areas |
| Session Timer | Track practice duration |
| Recording | Optional session recording |

## Question Categories

| Category | Description |
|----------|-------------|
| Timeline | Sequence and timing of events |
| Credibility | Challenge witness reliability |
| Inconsistency | Highlight contradictions |
| Foundation | Establish basis for knowledge |
| Impeachment | Prior statements/conduct |
| General | Standard cross-exam questions |

## Case.dev Integration

See [references/casedev-llm-practice.md](references/casedev-llm-practice.md) for API patterns.

### Vaults - Document Storage
```typescript
// Upload case materials with OCR
const doc = await uploadToVault(vaultId, file);
// Search for relevant context
const context = await searchVault(vaultId, topic);
```

### LLMs - Question Generation
```typescript
// Generate cross-examination questions from documents
const questions = await generateQuestions(vaultId, witnessInfo);
```

### LLMs - Practice Mode
```typescript
// Interactive examiner responses
const followUp = await practiceExaminer(question, witnessAnswer, context);
```

## Development

### Setup
```bash
npm install
cp .env.example .env.local
# Add CASEDEV_API_KEY
npm run dev
```

### Environment
```
CASEDEV_API_KEY=sk_case_...    # Case.dev API key
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/sessions | Create prep session |
| GET | /api/sessions | List sessions |
| GET | /api/sessions/:id | Get session |
| PATCH | /api/sessions/:id | Update session |
| DELETE | /api/sessions/:id | Delete session |
| POST | /api/sessions/:id/documents | Upload document |
| POST | /api/sessions/:id/generate-questions | Generate questions |
| POST | /api/sessions/:id/practice | Submit practice answer |
| GET | /api/sessions/:id/practice | Get practice history |

## Common Tasks

### Adding a Question Category
1. Add to category enum in `types.ts`
2. Update generation prompt in `generate-questions/route.ts`
3. Add UI filter option

### Improving Question Generation
Modify the system prompt to focus on specific case aspects or questioning styles.

### Adding Feedback Types
1. Extend `PracticeFeedback` type
2. Update coaching prompt in `practice/route.ts`
3. Display in practice UI

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Questions not relevant | Upload more specific documents |
| Practice feedback generic | Add more case context |
| Documents not searchable | Wait for OCR processing |
