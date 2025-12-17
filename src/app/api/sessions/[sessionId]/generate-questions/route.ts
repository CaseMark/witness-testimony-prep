import { NextRequest, NextResponse } from 'next/server';
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

IMPORTANT: Return ONLY the JSON array. No markdown, no code blocks, no explanatory text before or after.`;

// Robust JSON parsing with multiple fallback strategies
function parseJSONResponse(content: string): unknown[] | null {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Clean and parse
  try {
    let cleaned = content.trim();
    // Remove BOM and other invisible characters
    cleaned = cleaned.replace(/^\uFEFF/, '');
    // Remove markdown code blocks (various formats)
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Extract JSON array using regex (greedy)
  try {
    const arrayMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (arrayMatch) {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 4: Find first [ and last ] and try to parse
  try {
    const firstBracket = content.indexOf('[');
    const lastBracket = content.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      const jsonStr = content.substring(firstBracket, lastBracket + 1);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 5: Try to fix common JSON issues
  try {
    let fixed = content;
    // Extract potential JSON
    const firstBracket = fixed.indexOf('[');
    const lastBracket = fixed.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1) {
      fixed = fixed.substring(firstBracket, lastBracket + 1);
    }
    // Fix trailing commas
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');
    // Fix unescaped newlines in strings
    fixed = fixed.replace(/(?<!\\)\\n/g, '\\n');
    
    const parsed = JSON.parse(fixed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Continue to next strategy
  }

  // Strategy 6: Try to extract individual question objects
  try {
    const questionMatches = content.matchAll(/\{[^{}]*"question"[^{}]*\}/g);
    const questions: unknown[] = [];
    for (const match of questionMatches) {
      try {
        const q = JSON.parse(match[0]);
        if (q && typeof q.question === 'string') {
          questions.push(q);
        }
      } catch {
        // Skip malformed objects
      }
    }
    if (questions.length > 0) return questions;
  } catch {
    // All strategies failed
  }

  return null;
}

// Generate fallback questions based on document content
function generateFallbackQuestions(caseName: string, witnessName: string, documents: Array<{ name: string; content?: string }>): CrossExamQuestion[] {
  const docNames = documents.map(d => d.name).join(', ');
  
  const fallbackQuestions: CrossExamQuestion[] = [
    {
      id: uuidv4(),
      question: `${witnessName}, you've reviewed documents related to this case. Can you tell us exactly when you first became aware of the events described in ${documents[0]?.name || 'the documents'}?`,
      category: 'timeline',
      difficulty: 'medium',
      suggestedApproach: 'Be specific about dates and times. If uncertain, say so.',
      weakPoint: 'Timeline inconsistencies',
      followUpQuestions: ['What were you doing at that time?', 'Who else was present?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: 'How did you prepare for your testimony today?',
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Be honest about preparation. It\'s normal to review documents with counsel.',
      weakPoint: 'May suggest coaching',
      followUpQuestions: ['Who did you meet with?', 'How many times did you meet?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: 'Are you being compensated in any way for your testimony?',
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Answer directly. Expert witnesses are typically compensated; fact witnesses usually are not.',
      weakPoint: 'Potential bias',
      followUpQuestions: ['How much?', 'Does your compensation depend on the outcome?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Looking at the documents you've reviewed, can you identify any statements that you now believe may have been inaccurate?`,
      category: 'credibility',
      difficulty: 'hard',
      suggestedApproach: 'If there are inaccuracies, acknowledge them. Honesty builds credibility.',
      weakPoint: 'Prior inconsistent statements',
      followUpQuestions: ['Why didn\'t you correct this earlier?', 'What else might be inaccurate?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: 'What is your relationship to the parties in this case?',
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Describe relationships factually without editorializing.',
      weakPoint: 'Potential bias based on relationships',
      followUpQuestions: ['How long have you known them?', 'Have you ever had conflicts?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `You mentioned specific details in your statement. How can you be so certain about these details after all this time?`,
      category: 'credibility',
      difficulty: 'medium',
      suggestedApproach: 'Explain what makes certain memories stand out. Acknowledge limitations where appropriate.',
      weakPoint: 'Memory reliability',
      followUpQuestions: ['Did you take notes at the time?', 'Have you discussed this with others?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: 'Have you ever given testimony that was later found to be inaccurate?',
      category: 'impeachment',
      difficulty: 'hard',
      suggestedApproach: 'Answer honestly. If yes, explain the circumstances.',
      weakPoint: 'Prior credibility issues',
      followUpQuestions: ['What were the circumstances?', 'How did you discover the inaccuracy?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Based on the documents in this case, there appear to be gaps in the timeline. Can you explain what happened during these periods?`,
      category: 'timeline',
      difficulty: 'medium',
      suggestedApproach: 'If you don\'t know, say so. Don\'t speculate.',
      weakPoint: 'Incomplete knowledge',
      followUpQuestions: ['Were you present during this time?', 'Who would know?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: 'Did you discuss your testimony with anyone other than your attorney before today?',
      category: 'general',
      difficulty: 'medium',
      suggestedApproach: 'Be truthful. Discussions with family or colleagues are normal but should be disclosed.',
      weakPoint: 'Potential coordination of testimony',
      followUpQuestions: ['What did you discuss?', 'Did they influence your recollection?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `The documents suggest a particular sequence of events. Do you agree with that sequence, or do you recall it differently?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'If you disagree, explain specifically what you recall differently and why.',
      weakPoint: 'Contradicting documentary evidence',
      followUpQuestions: ['What specifically do you recall differently?', 'Why should we believe your memory over the documents?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: 'How would you describe your memory in general? Do you consider yourself someone with a good memory?',
      category: 'credibility',
      difficulty: 'easy',
      suggestedApproach: 'Be honest about your memory capabilities without being self-deprecating.',
      weakPoint: 'Self-assessment of reliability',
      followUpQuestions: ['Have you ever forgotten important details?', 'Do you keep notes or records?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Were you under any stress or distraction at the time of the events described in these documents?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Acknowledge any factors that might have affected your perception.',
      weakPoint: 'Impaired observation',
      followUpQuestions: ['How might that have affected what you observed?', 'Were you taking any medications?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: 'Is there anything you wish you had done differently regarding the events in this case?',
      category: 'credibility',
      difficulty: 'medium',
      suggestedApproach: 'This is often a trap. Answer carefully without admitting fault inappropriately.',
      weakPoint: 'Admissions against interest',
      followUpQuestions: ['Why didn\'t you do that?', 'Do you regret your actions?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Looking at the specific details in the documents, how do you explain any discrepancies between what's written and what you're testifying to today?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'Address discrepancies directly. Explain if documents are incomplete or if your memory has been refreshed.',
      weakPoint: 'Documentary contradictions',
      followUpQuestions: ['Which version is correct?', 'Were you lying then or now?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: 'What do you stand to gain or lose from the outcome of this case?',
      category: 'general',
      difficulty: 'medium',
      suggestedApproach: 'Be transparent about any interest in the outcome.',
      weakPoint: 'Financial or personal interest',
      followUpQuestions: ['Are you a party to any related litigation?', 'Do you have any financial interest?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Can you explain your role in the events documented in ${documents[0]?.name || 'the case materials'}?`,
      category: 'foundation',
      difficulty: 'easy',
      suggestedApproach: 'Clearly explain your involvement and the basis for your knowledge.',
      weakPoint: 'Limited firsthand knowledge',
      followUpQuestions: ['Were you directly involved?', 'How do you know what you\'re testifying about?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: 'Have you ever been convicted of a crime?',
      category: 'impeachment',
      difficulty: 'hard',
      suggestedApproach: 'Answer honestly. Only certain convictions are typically admissible for impeachment.',
      weakPoint: 'Character for truthfulness',
      followUpQuestions: ['What were the circumstances?', 'Did it involve dishonesty?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `The documents reference specific communications. Did you keep copies of all relevant communications?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Explain your document retention practices honestly.',
      weakPoint: 'Missing evidence',
      followUpQuestions: ['Why not?', 'What happened to them?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: 'Is there anything about your testimony today that you\'re not completely certain about?',
      category: 'credibility',
      difficulty: 'medium',
      suggestedApproach: 'It\'s okay to acknowledge uncertainty. It can actually enhance credibility.',
      weakPoint: 'Overconfidence or uncertainty',
      followUpQuestions: ['What specifically are you uncertain about?', 'Why are you testifying about things you\'re not sure of?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Finally, is there anything in these documents that you believe is false or misleading?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'If you believe something is false, explain specifically what and why.',
      weakPoint: 'Challenging documentary evidence',
      followUpQuestions: ['How do you know it\'s false?', 'Why would someone create a false document?'],
      documentReference: docNames,
    },
  ];

  return fallbackQuestions;
}

// POST /api/sessions/[sessionId]/generate-questions - Generate cross-exam questions
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
    
    if (session.documents.length === 0) {
      return NextResponse.json(
        { error: 'No documents uploaded. Please upload case materials first.' },
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
    
    // Update status to generating
    updateSession(sessionId, { status: 'generating' });
    
    // Prepare document context with full content
    const documentContext = session.documents
      .map((doc: { name: string; content?: string }) => {
        const content = doc.content || '[Content not available - please upload a text file]';
        return `=== DOCUMENT: ${doc.name} ===\n${content}\n=== END DOCUMENT ===`;
      })
      .join('\n\n');
    
    const userPrompt = `Case: ${session.caseName}
Witness: ${session.witnessName}

DOCUMENTS TO ANALYZE:
${documentContext}

Based on the specific content in these documents, generate 20 cross-examination questions. Each question MUST reference specific facts, names, dates, times, or details from the documents above. Do not generate generic questions.

CRITICAL: Return ONLY a valid JSON array. No markdown formatting, no code blocks, no text before or after the JSON.`;

    let questions: CrossExamQuestion[] = [];
    let usedFallback = false;

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
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLM API error:', errorText);
        // Use fallback questions instead of failing
        questions = generateFallbackQuestions(session.caseName, session.witnessName, session.documents);
        usedFallback = true;
      } else {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        if (!content) {
          // Use fallback questions
          questions = generateFallbackQuestions(session.caseName, session.witnessName, session.documents);
          usedFallback = true;
        } else {
          // Try to parse with robust parser
          const questionsData = parseJSONResponse(content);
          
          if (questionsData && questionsData.length > 0) {
            // Transform to our question format
            questions = questionsData.slice(0, 20).map((q: unknown) => {
              const qObj = q as Record<string, unknown>;
              return {
                id: uuidv4(),
                question: String(qObj.question || 'Question not available'),
                category: validateCategory(String(qObj.category || 'general')),
                difficulty: validateDifficulty(String(qObj.difficulty || 'medium')),
                suggestedApproach: qObj.suggestedApproach ? String(qObj.suggestedApproach) : undefined,
                weakPoint: qObj.weakPoint ? String(qObj.weakPoint) : undefined,
                followUpQuestions: Array.isArray(qObj.followUpQuestions) 
                  ? qObj.followUpQuestions.map((f: unknown) => String(f))
                  : undefined,
                documentReference: qObj.documentReference ? String(qObj.documentReference) : undefined,
              };
            });
          } else {
            // Parsing failed, use fallback
            console.warn('Failed to parse LLM response, using fallback questions. Raw content length:', content.length);
            questions = generateFallbackQuestions(session.caseName, session.witnessName, session.documents);
            usedFallback = true;
          }
        }
      }
    } catch (apiError) {
      console.error('LLM API error:', apiError);
      // Use fallback questions instead of failing
      questions = generateFallbackQuestions(session.caseName, session.witnessName, session.documents);
      usedFallback = true;
    }

    // Ensure we have at least some questions
    if (questions.length === 0) {
      questions = generateFallbackQuestions(session.caseName, session.witnessName, session.documents);
      usedFallback = true;
    }
    
    // Save questions to session
    const updatedSession = setQuestions(sessionId, questions);
    
    return NextResponse.json({
      questions,
      session: updatedSession ? serializeSession(updatedSession) : null,
      usedFallback, // Let the client know if fallback was used
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}

function validateCategory(category: string): CrossExamQuestion['category'] {
  const valid = ['timeline', 'credibility', 'inconsistency', 'foundation', 'impeachment', 'general'];
  return valid.includes(category) ? category as CrossExamQuestion['category'] : 'general';
}

function validateDifficulty(difficulty: string): CrossExamQuestion['difficulty'] {
  const valid = ['easy', 'medium', 'hard'];
  return valid.includes(difficulty) ? difficulty as CrossExamQuestion['difficulty'] : 'medium';
}
