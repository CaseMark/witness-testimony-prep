import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, setQuestions, updateSession, serializeSession } from '@/lib/session-store';
import { CrossExamQuestion } from '@/lib/types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const QUESTION_GENERATION_PROMPT = `You are an experienced trial attorney preparing cross-examination questions for a witness. Based on the provided case documents, generate exactly 20 likely cross-examination questions that opposing counsel might ask.

STRUCTURE YOUR 20 QUESTIONS AS FOLLOWS:
- 15-17 questions: DOCUMENT-SPECIFIC - These MUST be specifically based on the content of the documents provided. Reference specific facts, names, dates, times, locations, and details from the documents.
- 3-5 questions: GENERAL CROSS-EXAMINATION - These are standard cross-examination questions that opposing counsel commonly asks ANY witness, regardless of the case specifics. These test general credibility, memory, bias, and preparation.

For each question, provide:
1. The question itself
2. Category: one of "timeline", "credibility", "inconsistency", "foundation", "impeachment", or "general"
3. Difficulty: "easy", "medium", or "hard"
4. A suggested approach for how the witness should handle this question
5. Any weak points this question might expose
6. 2-3 potential follow-up questions opposing counsel might ask
7. A reference to which document this relates to (use "General Cross-Examination" for the 3-5 general questions)

FOR DOCUMENT-SPECIFIC QUESTIONS, focus on:
- Specific timeline details mentioned in the documents
- Credibility challenges based on what the witness claims to have seen/heard/done
- Potential inconsistencies in the narrative
- Foundation questions about how the witness knows specific facts
- Impeachment opportunities based on statements in the documents
- Specific names, dates, times, and locations mentioned

FOR GENERAL QUESTIONS (3-5), include classics like:
- Questions about witness preparation and who they spoke with
- Questions about compensation or bias
- Questions testing memory and certainty
- Questions about prior inconsistent statements
- Questions about the witness's relationship to parties

Return your response as a JSON array with exactly 20 questions in this format:
[
  {
    "question": "The actual question text referencing specific document details",
    "category": "timeline|credibility|inconsistency|foundation|impeachment|general",
    "difficulty": "easy|medium|hard",
    "suggestedApproach": "How the witness should approach answering",
    "weakPoint": "What vulnerability this exposes based on the documents",
    "followUpQuestions": ["Follow-up 1", "Follow-up 2"],
    "documentReference": "Which document/section this relates to"
  }
]

Only return the JSON array, no other text.`;

// POST /api/sessions/[sessionId]/generate-questions-stream - Generate cross-exam questions with streaming
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { sessionId } = await params;
  const session = getSession(sessionId);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  if (session.documents.length === 0) {
    return new Response(JSON.stringify({ error: 'No documents uploaded. Please upload case materials first.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const apiKey = process.env.CASEDEV_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Case.dev API key not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  updateSession(sessionId, { status: 'generating' });
  
  const documentContext = session.documents
    .map(doc => {
      const content = doc.content || '[Content not available - please upload a text file]';
      return `=== DOCUMENT: ${doc.name} ===\n${content}\n=== END DOCUMENT ===`;
    })
    .join('\n\n');
  
  const userPrompt = `Case: ${session.caseName}
Witness: ${session.witnessName}

DOCUMENTS TO ANALYZE:
${documentContext}

Based on the specific content in these documents, generate 20 cross-examination questions. Each question MUST reference specific facts, names, dates, times, or details from the documents above. Do not generate generic questions.`;

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await fetch('https://api.case.dev/llm/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'anthropic/claude-3-haiku-20240307',
            messages: [
              { role: 'system', content: QUESTION_GENERATION_PROMPT },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 8000,
            stream: true,
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('LLM API error:', errorText);
          updateSession(sessionId, { status: 'setup' });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to generate questions' })}\n\n`));
          controller.close();
          return;
        }
        
        const reader = response.body?.getReader();
        if (!reader) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'No response body' })}\n\n`));
          controller.close();
          return;
        }
        
        let fullContent = '';
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  // Send progress update
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: content, progress: fullContent.length })}\n\n`));
                }
              } catch {
                // Skip unparseable chunks
              }
            }
          }
        }
        
        // Parse the complete response
        try {
          const jsonMatch = fullContent.match(/\[[\s\S]*\]/);
          let questionsData;
          if (jsonMatch) {
            questionsData = JSON.parse(jsonMatch[0]);
          } else {
            questionsData = JSON.parse(fullContent);
          }
          
          if (!Array.isArray(questionsData) || questionsData.length === 0) {
            throw new Error('Invalid questions data');
          }
          
          const questions: CrossExamQuestion[] = questionsData.slice(0, 20).map((q: {
            question: string;
            category: string;
            difficulty: string;
            suggestedApproach?: string;
            weakPoint?: string;
            followUpQuestions?: string[];
            documentReference?: string;
          }) => ({
            id: uuidv4(),
            question: q.question,
            category: validateCategory(q.category),
            difficulty: validateDifficulty(q.difficulty),
            suggestedApproach: q.suggestedApproach,
            weakPoint: q.weakPoint,
            followUpQuestions: q.followUpQuestions,
            documentReference: q.documentReference,
          }));
          
          const updatedSession = setQuestions(sessionId, questions);
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            done: true, 
            questions, 
            session: updatedSession ? serializeSession(updatedSession) : null 
          })}\n\n`));
        } catch (parseError) {
          console.error('Failed to parse LLM response:', fullContent);
          updateSession(sessionId, { status: 'setup' });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Failed to parse response' })}\n\n`));
        }
        
        controller.close();
      } catch (error) {
        console.error('Stream error:', error);
        updateSession(sessionId, { status: 'setup' });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`));
        controller.close();
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

function validateCategory(category: string): CrossExamQuestion['category'] {
  const valid = ['timeline', 'credibility', 'inconsistency', 'foundation', 'impeachment', 'general'];
  return valid.includes(category) ? category as CrossExamQuestion['category'] : 'general';
}

function validateDifficulty(difficulty: string): CrossExamQuestion['difficulty'] {
  const valid = ['easy', 'medium', 'hard'];
  return valid.includes(difficulty) ? difficulty as CrossExamQuestion['difficulty'] : 'medium';
}
