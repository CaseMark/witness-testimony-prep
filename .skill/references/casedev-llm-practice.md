# Case.dev LLM Practice API Reference

Patterns for AI-powered cross-examination practice and question generation.

## Question Generation

### Generate Cross-Examination Questions
```typescript
interface GenerateQuestionsRequest {
  vault_id: string;
  witness_info: {
    name: string;
    role: string;  // 'plaintiff' | 'defendant' | 'expert' | 'fact_witness'
    topics: string[];
  };
  case_context?: string;
  question_count?: number;  // Default 20
  categories?: QuestionCategory[];
}

type QuestionCategory = 
  | 'timeline'
  | 'credibility'
  | 'inconsistency'
  | 'foundation'
  | 'impeachment'
  | 'general';

interface GeneratedQuestion {
  id: string;
  question: string;
  category: QuestionCategory;
  purpose: string;  // Why this question matters
  source_document?: string;
  suggested_followups: string[];
  weak_point?: string;  // Potential vulnerability
}

async function generateQuestions(
  vaultId: string,
  witnessInfo: WitnessInfo
): Promise<GeneratedQuestion[]> {
  // 1. Search vault for relevant document chunks
  const context = await searchVault(vaultId, witnessInfo.topics.join(' '), {
    limit: 20,
  });
  
  // 2. Generate questions using LLM
  return casedevFetch('/llm/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: buildQuestionPrompt(witnessInfo, context),
      response_format: 'json',
      schema: questionSchema,
    }),
  }).then(r => r.json());
}
```

### Question Generation Prompt
```typescript
function buildQuestionPrompt(
  witnessInfo: WitnessInfo,
  context: SearchResult[]
): string {
  return `You are an experienced trial attorney preparing cross-examination questions.

WITNESS: ${witnessInfo.name}
ROLE: ${witnessInfo.role}
TOPICS: ${witnessInfo.topics.join(', ')}

CASE MATERIALS:
${context.map(c => `[${c.document_name}]: ${c.content}`).join('\n\n')}

Generate 20 cross-examination questions that:
1. Challenge the witness's credibility
2. Expose inconsistencies in testimony
3. Establish facts favorable to our case
4. Set up impeachment opportunities
5. Control the narrative through leading questions

For each question, provide:
- The question text (closed-ended, leading)
- Category (timeline/credibility/inconsistency/foundation/impeachment/general)
- Purpose (what you're trying to establish)
- Suggested follow-ups based on likely answers
- Any weak points this exposes

Format as JSON array.`;
}
```

## Practice Mode

### Interactive Examiner
```typescript
interface PracticeRequest {
  session_id: string;
  question: GeneratedQuestion;
  witness_response: string;
  conversation_history: PracticeExchange[];
}

interface PracticeExchange {
  question: string;
  response: string;
  feedback?: string;
}

interface PracticeResponse {
  follow_up_question: string;
  feedback: PracticeFeedback;
  coaching_tips: string[];
  should_continue: boolean;
}

interface PracticeFeedback {
  rating: 'good' | 'needs_improvement' | 'problematic';
  strengths: string[];
  weaknesses: string[];
  suggested_response?: string;
}

async function practiceExaminer(
  request: PracticeRequest
): Promise<PracticeResponse> {
  return casedevFetch('/llm/chat', {
    method: 'POST',
    body: JSON.stringify({
      system_prompt: examinerSystemPrompt,
      messages: buildPracticeMessages(request),
      temperature: 0.7,
    }),
  }).then(r => r.json());
}
```

### Examiner System Prompt
```typescript
const examinerSystemPrompt = `You are a skilled cross-examining attorney conducting witness preparation.

Your role:
1. Ask tough but fair cross-examination questions
2. Follow up on weak or evasive answers
3. Provide constructive feedback after each response
4. Coach the witness on better responses

Cross-examination principles:
- Use leading questions (suggest the answer)
- Ask one fact at a time
- Control the witness
- Build to your conclusion
- Listen for openings to exploit

Feedback should be:
- Specific and actionable
- Focus on substance, not delivery
- Suggest concrete improvements
- Identify when answer was good

Respond in JSON format with follow_up_question, feedback, coaching_tips, and should_continue.`;
```

### Practice Messages Builder
```typescript
function buildPracticeMessages(request: PracticeRequest) {
  const messages = [];
  
  // Add conversation history
  for (const exchange of request.conversation_history) {
    messages.push({ role: 'assistant', content: exchange.question });
    messages.push({ role: 'user', content: exchange.response });
  }
  
  // Add current exchange
  messages.push({ 
    role: 'assistant', 
    content: request.question.question 
  });
  messages.push({ 
    role: 'user', 
    content: request.witness_response 
  });
  
  // Request evaluation
  messages.push({
    role: 'user',
    content: 'Provide feedback on my response and ask a follow-up question.',
  });
  
  return messages;
}
```

## Coaching Feedback

### Response Analysis
```typescript
interface AnalyzeResponseRequest {
  question: string;
  response: string;
  case_context: string;
}

interface ResponseAnalysis {
  overall_rating: number;  // 1-5
  credibility_impact: 'positive' | 'neutral' | 'negative';
  issues: {
    type: 'inconsistency' | 'volunteering' | 'evasion' | 'speculation' | 'argumentative';
    description: string;
    location: string;
  }[];
  strengths: string[];
  recommended_response: string;
}

async function analyzeResponse(
  request: AnalyzeResponseRequest
): Promise<ResponseAnalysis> {
  return casedevFetch('/llm/analyze', {
    method: 'POST',
    body: JSON.stringify({
      prompt: `Analyze this witness response:
        
Question: ${request.question}
Response: ${request.response}
Case Context: ${request.case_context}

Evaluate for:
1. Credibility impact
2. Common witness mistakes (volunteering, speculation, arguing)
3. Consistency with case materials
4. Opportunities for impeachment

Provide a recommended response that is truthful but more effective.`,
      response_format: 'json',
    }),
  }).then(r => r.json());
}
```

## Weak Point Identification

### Find Testimony Vulnerabilities
```typescript
interface WeakPointAnalysis {
  document_id: string;
  document_name: string;
  weak_points: {
    topic: string;
    vulnerability: string;
    likely_attack: string;
    preparation_suggestion: string;
    severity: 'high' | 'medium' | 'low';
  }[];
}

async function identifyWeakPoints(vaultId: string): Promise<WeakPointAnalysis[]> {
  // Search for contradictions, gaps, damaging admissions
  const analysis = await casedevFetch('/llm/analyze', {
    method: 'POST',
    body: JSON.stringify({
      vault_id: vaultId,
      analysis_type: 'weak_points',
      prompt: `Review case materials for testimony vulnerabilities:
        - Contradictions between documents
        - Timeline inconsistencies
        - Damaging admissions
        - Areas of speculation
        - Foundation gaps
        
For each, explain the vulnerability and how opposing counsel might exploit it.`,
    }),
  });
  
  return analysis.json();
}
```

## Session Recording (Voice API)

### Record Practice Session
```typescript
async function startRecording(sessionId: string): Promise<string> {
  const { recording_id } = await casedevFetch('/voice/record/start', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  }).then(r => r.json());
  
  return recording_id;
}

async function stopRecording(recordingId: string): Promise<{
  transcript: string;
  audio_url: string;
}> {
  return casedevFetch(`/voice/record/${recordingId}/stop`, {
    method: 'POST',
  }).then(r => r.json());
}
```

## Best Practices

1. **Upload complete materials** - More context = better questions
2. **Specify witness role** - Expert vs fact witness need different approaches
3. **Practice multiple times** - Questions adapt to previous responses
4. **Review weak points first** - Focus preparation where it matters
5. **Record sessions** - Review with attorney for additional coaching
