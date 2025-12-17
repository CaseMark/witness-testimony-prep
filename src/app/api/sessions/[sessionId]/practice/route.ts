import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, addPracticeExchange, updateSession, serializeSession } from '@/lib/session-store';
import { PracticeExchange } from '@/lib/types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const AI_EXAMINER_PROMPT = `You are an experienced opposing counsel conducting a cross-examination. Your role is to:

1. Evaluate the witness's response to the question
2. Identify any weaknesses, inconsistencies, or areas to probe further based on the case documents
3. Provide a realistic follow-up question that opposing counsel might ask - this MUST relate to the specific facts in the documents
4. Give constructive feedback on how the witness could improve their response

Be professional but thorough. Look for:
- Vague or evasive answers that don't address specific facts from the documents
- Inconsistencies with the documents or prior statements
- Opportunities to impeach credibility based on document details
- Gaps in knowledge or memory about specific events mentioned in documents
- Emotional reactions that could be exploited

Your follow-up questions should reference specific details from the case documents when possible.

Respond in JSON format:
{
  "followUp": "The follow-up question opposing counsel would likely ask - reference specific document details",
  "feedback": "Constructive feedback for the witness on their response",
  "weaknessIdentified": "Any weakness in the response that was exposed",
  "suggestedImprovement": "How the witness could have answered better"
}`;

// POST /api/sessions/[sessionId]/practice - Submit a practice response
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    const { questionId, question, response: witnessResponse, duration } = body;
    
    if (!questionId || !question || !witnessResponse) {
      return NextResponse.json(
        { error: 'questionId, question, and response are required' },
        { status: 400 }
      );
    }
    
    // Check if API key is configured
    const apiKey = process.env.CASEDEV_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Case.dev API key not configured. Please add CASEDEV_API_KEY to your .env.local file.' },
        { status: 500 }
      );
    }
    
    // Update session status to practicing
    if (session.status !== 'practicing') {
      updateSession(sessionId, { status: 'practicing' });
    }
    
    // Get the question details
    const questionDetails = session.questions.find(q => q.id === questionId);
    
    // Build context for the AI examiner with full document content
    const documentContext = session.documents
      .map(doc => `=== DOCUMENT: ${doc.name} ===\n${doc.content || '[Content not available]'}\n=== END DOCUMENT ===`)
      .join('\n\n');
    
    const userPrompt = `Case: ${session.caseName}
Witness: ${session.witnessName}

CASE DOCUMENTS:
${documentContext}

CROSS-EXAMINATION CONTEXT:
Question Asked: "${question}"
${questionDetails?.suggestedApproach ? `Suggested Approach: ${questionDetails.suggestedApproach}` : ''}
${questionDetails?.weakPoint ? `Known Weak Point: ${questionDetails.weakPoint}` : ''}
${questionDetails?.documentReference ? `Document Reference: ${questionDetails.documentReference}` : ''}

WITNESS RESPONSE: "${witnessResponse}"

Analyze this response in the context of the case documents. Provide a follow-up question that references specific details from the documents, and give feedback on the response.`;

    let aiResponse = {
      followUp: '',
      feedback: '',
      weaknessIdentified: '',
      suggestedImprovement: '',
    };

    try {
      const llmResponse = await fetch('https://api.case.dev/llm/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku-20240307',
          messages: [
            { role: 'system', content: AI_EXAMINER_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });
      
      if (!llmResponse.ok) {
        const errorText = await llmResponse.text();
        console.error('LLM API error:', errorText);
        return NextResponse.json(
          { error: `Failed to analyze response: ${llmResponse.statusText}` },
          { status: 500 }
        );
      }
      
      const data = await llmResponse.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      if (!content) {
        return NextResponse.json(
          { error: 'No response from LLM' },
          { status: 500 }
        );
      }
      
      try {
        // Try to extract JSON from the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
        } else {
          aiResponse = JSON.parse(content);
        }
      } catch {
        // If parsing fails, use the content as feedback
        aiResponse = {
          followUp: 'Can you elaborate on that answer?',
          feedback: content,
          weaknessIdentified: '',
          suggestedImprovement: '',
        };
      }
    } catch (apiError) {
      console.error('LLM API error:', apiError);
      return NextResponse.json(
        { error: 'Failed to connect to LLM API. Please check your API key and try again.' },
        { status: 500 }
      );
    }
    
    // Create practice exchange record
    const exchange: PracticeExchange = {
      id: uuidv4(),
      questionId,
      question,
      witnessResponse,
      aiFollowUp: aiResponse.followUp,
      feedback: aiResponse.feedback,
      timestamp: new Date(),
      duration: duration || 0,
    };
    
    // Add to session history
    const updatedSession = addPracticeExchange(sessionId, exchange);
    
    return NextResponse.json({
      exchange: {
        ...exchange,
        timestamp: exchange.timestamp.toISOString(),
      },
      aiResponse,
      session: updatedSession ? serializeSession(updatedSession) : null,
    });
  } catch (error) {
    console.error('Error processing practice response:', error);
    return NextResponse.json(
      { error: 'Failed to process practice response' },
      { status: 500 }
    );
  }
}

// GET /api/sessions/[sessionId]/practice - Get practice history
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      practiceHistory: session.practiceHistory.map(exchange => ({
        ...exchange,
        timestamp: exchange.timestamp.toISOString(),
      })),
      totalDuration: session.totalDuration,
      questionsAnswered: session.practiceHistory.length,
      totalQuestions: session.questions.length,
    });
  } catch (error) {
    console.error('Error fetching practice history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch practice history' },
      { status: 500 }
    );
  }
}
