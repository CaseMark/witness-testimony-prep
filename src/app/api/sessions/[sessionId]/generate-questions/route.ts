import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, setQuestions, updateSession, serializeSession } from '@/lib/session-store';
import { CrossExamQuestion } from '@/lib/types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// Dynamic system prompt that includes the actual witness name
function getQuestionGenerationPrompt(witnessName: string): string {
  return `You are an experienced trial attorney preparing cross-examination questions for ${witnessName}. Based on the provided case documents, generate exactly 20 likely cross-examination questions that opposing counsel might ask ${witnessName}.

═══════════════════════════════════════════════════════════════════════════════
WITNESS IDENTITY - READ THIS CAREFULLY:
═══════════════════════════════════════════════════════════════════════════════
THE WITNESS YOU ARE PREPARING QUESTIONS FOR IS: ${witnessName}
THE WITNESS YOU ARE PREPARING QUESTIONS FOR IS: ${witnessName}
THE WITNESS YOU ARE PREPARING QUESTIONS FOR IS: ${witnessName}

⚠️ CRITICAL WARNING ABOUT DOCUMENTS:
The documents you will analyze may contain depositions, testimony, or statements from OTHER people who are NOT ${witnessName}. These are EVIDENCE documents about the case.
DO NOT get confused by names that appear in depositions or testimony within the documents.
The ONLY witness you are preparing questions for is ${witnessName}.

When you see testimony or depositions from other people in the documents:
- These are EVIDENCE that ${witnessName} may be asked about
- Prepare questions asking ${witnessName} what THEY know about what those other people said
- Prepare questions asking ${witnessName} if THEY agree or disagree with what others testified
- NEVER prepare questions directed at those other people - they are not the witness
═══════════════════════════════════════════════════════════════════════════════

CRITICAL REQUIREMENTS:
1. ALL questions (main questions AND follow-up questions) MUST be directed TO ${witnessName} - ${witnessName} is the ONLY person being questioned
2. Do NOT start every question with "${witnessName}" - this is repetitive. Use natural questioning style with "you" and "your"
3. When documents mention other people (anyone who is NOT ${witnessName}), ask ${witnessName} about THEIR knowledge of those people - do NOT ask questions as if those other people are the witness
4. If documents contain depositions or testimony from other witnesses, prepare questions asking ${witnessName} about what THEY know regarding that testimony - do NOT prepare questions for those other witnesses
5. ALL follow-up questions must also be directed to ${witnessName} about ${witnessName}'s knowledge, actions, or observations - NEVER direct follow-up questions to other people mentioned in documents

STRUCTURE YOUR 20 QUESTIONS AS FOLLOWS:
- 15 questions: DOCUMENT-SPECIFIC - These MUST be specifically based on the content of the documents provided. Reference specific facts, names, dates, times, locations, and details from the documents.
- 5 questions: GENERAL CROSS-EXAMINATION - These are standard cross-examination questions that opposing counsel commonly asks ANY witness, regardless of the case specifics. These test general credibility, memory, bias, and preparation. Mark these with category "general".

For each question, provide:
1. The question itself - directed to ${witnessName} using "you" and "your"
2. Category: one of "timeline", "credibility", "inconsistency", "foundation", "impeachment", or "general"
3. Difficulty: "easy", "medium", or "hard"
4. A suggested approach for how ${witnessName} should handle this question
5. Any weak points this question might expose
6. 2-3 potential follow-up questions - these MUST also be directed to ${witnessName} (using "you/your")
7. A reference to which document this relates to (use "General Cross-Examination" for the 5 general questions)

FOR DOCUMENT-SPECIFIC QUESTIONS (15), focus on:
- Specific timeline details mentioned in the documents
- Credibility challenges based on what ${witnessName} claims to have seen/heard/done
- Potential inconsistencies in the narrative
- Foundation questions about how ${witnessName} knows specific facts
- Impeachment opportunities based on statements in the documents
- Specific names, dates, times, and locations mentioned

FOR GENERAL QUESTIONS (5 REQUIRED), you MUST include these standard cross-examination questions:
1. A question about how ${witnessName} prepared for testimony and who they spoke with
2. A question about compensation or financial interest in the case outcome
3. A question testing ${witnessName}'s memory and certainty
4. A question about ${witnessName}'s relationship to the parties
5. A question about whether ${witnessName} has ever given inaccurate testimony

QUESTION EXAMPLES (good vs bad):
BAD FOLLOW-UP (asking wrong person): "What did Mr. Smith know about this?"
GOOD FOLLOW-UP (asking ${witnessName}): "What did Mr. Smith tell you about this?"

Return your response as a JSON array with exactly 20 questions in this format:
[
  {
    "question": "Question directed to ${witnessName}...",
    "category": "timeline|credibility|inconsistency|foundation|impeachment|general",
    "difficulty": "easy|medium|hard",
    "suggestedApproach": "How ${witnessName} should approach answering",
    "weakPoint": "What vulnerability this exposes based on the documents",
    "followUpQuestions": ["Follow-up question addressed to ${witnessName}", "Another follow-up question addressed to ${witnessName}"],
    "documentReference": "Which document/section this relates to OR 'General Cross-Examination'"
  }
]

IMPORTANT: 
- Return ONLY the JSON array. No markdown, no code blocks, no explanatory text.
- All questions and follow-ups must be directed TO ${witnessName} (the person testifying).
- You MUST include exactly 5 questions with category "general".
- Remember: ${witnessName} is the ONLY person being questioned. All questions and follow-ups must be directed to ${witnessName}.`;
}

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

// Generate fallback questions - questions directed to witness without repetitive name prefix
function generateFallbackQuestions(caseName: string, witnessName: string, documents: Array<{ name: string; content?: string }>): CrossExamQuestion[] {
  const docNames = documents.map(d => d.name).join(', ');
  
  const fallbackQuestions: CrossExamQuestion[] = [
    // Document-specific questions (15) - varied question styles, all directed to witness
    {
      id: uuidv4(),
      question: `You've reviewed documents related to this case. Can you tell us exactly when you first became aware of the events described in ${documents[0]?.name || 'the documents'}?`,
      category: 'timeline',
      difficulty: 'medium',
      suggestedApproach: 'Be specific about dates and times. If uncertain, say so.',
      weakPoint: 'Timeline inconsistencies',
      followUpQuestions: ['What were you doing at that time?', 'Who else was present when you learned of this?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `Looking at the documents you've reviewed, can you identify any statements that you now believe may have been inaccurate?`,
      category: 'credibility',
      difficulty: 'hard',
      suggestedApproach: 'If there are inaccuracies, acknowledge them. Honesty builds credibility.',
      weakPoint: 'Prior inconsistent statements',
      followUpQuestions: ['Why didn\'t you correct this earlier?', 'What other statements might you need to revise?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `You mentioned specific details in your statement. How can you be so certain about these details after all this time?`,
      category: 'credibility',
      difficulty: 'medium',
      suggestedApproach: 'Explain what makes certain memories stand out. Acknowledge limitations where appropriate.',
      weakPoint: 'Memory reliability',
      followUpQuestions: ['Did you take notes at the time?', 'Have you discussed these events with anyone else?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `Based on the documents in this case, there appear to be gaps in the timeline. Can you explain what happened during these periods?`,
      category: 'timeline',
      difficulty: 'medium',
      suggestedApproach: 'If you don\'t know, say so. Don\'t speculate.',
      weakPoint: 'Incomplete knowledge',
      followUpQuestions: ['Were you present during this time?', 'Do you know who might have information about this period?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `The documents suggest a particular sequence of events. Do you agree with that sequence, or do you recall it differently?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'If you disagree, explain specifically what you recall differently and why.',
      weakPoint: 'Contradicting documentary evidence',
      followUpQuestions: ['What specifically do you recall differently?', 'Why should your memory be trusted over the documents?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `Were you under any stress or distraction at the time of the events described in these documents?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Acknowledge any factors that might have affected your perception.',
      weakPoint: 'Impaired observation',
      followUpQuestions: ['How might that have affected what you observed?', 'Were you taking any medications at the time?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `Looking at the specific details in the documents, how do you explain any discrepancies between what's written and what you're testifying to today?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'Address discrepancies directly. Explain if documents are incomplete or if your memory has been refreshed.',
      weakPoint: 'Documentary contradictions',
      followUpQuestions: ['Which version do you believe is correct?', 'Were you being truthful then or are you being truthful now?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `Can you explain your role in the events documented in ${documents[0]?.name || 'the case materials'}?`,
      category: 'foundation',
      difficulty: 'easy',
      suggestedApproach: 'Clearly explain your involvement and the basis for your knowledge.',
      weakPoint: 'Limited firsthand knowledge',
      followUpQuestions: ['Were you directly involved in these events?', 'How do you have knowledge of what you\'re testifying about?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `The documents reference specific communications. Did you keep copies of all relevant communications?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Explain your document retention practices honestly.',
      weakPoint: 'Missing evidence',
      followUpQuestions: ['Why didn\'t you keep copies?', 'What happened to those communications?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `Is there anything in these documents that you believe is false or misleading?`,
      category: 'inconsistency',
      difficulty: 'hard',
      suggestedApproach: 'If you believe something is false, explain specifically what and why.',
      weakPoint: 'Challenging documentary evidence',
      followUpQuestions: ['How do you know it\'s false?', 'Do you have any evidence to support your claim that it\'s false?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `Regarding the events in ${documents[0]?.name || 'the documents'}, who else was present that could corroborate your account?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Identify other witnesses who can support your testimony.',
      weakPoint: 'Lack of corroboration',
      followUpQuestions: ['Have you spoken with them about this case?', 'Would they agree with your version of events?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `The documents indicate certain actions were taken. Were you consulted before these actions occurred?`,
      category: 'foundation',
      difficulty: 'medium',
      suggestedApproach: 'Be clear about your level of involvement in decision-making.',
      weakPoint: 'Limited involvement or knowledge',
      followUpQuestions: ['Did you have any input in the decision?', 'Did you express any objections at the time?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `How soon after the events described in the documents did you first document your recollection?`,
      category: 'timeline',
      difficulty: 'medium',
      suggestedApproach: 'Explain when and how you recorded your memories.',
      weakPoint: 'Delayed documentation affects reliability',
      followUpQuestions: ['Why did you wait to document your recollection?', 'What prompted you to finally document it?'],
      documentReference: documents[0]?.name || 'Case Documents',
    },
    {
      id: uuidv4(),
      question: `Have you reviewed these documents with anyone before today's testimony?`,
      category: 'credibility',
      difficulty: 'easy',
      suggestedApproach: 'Be honest about document review. It\'s normal to prepare.',
      weakPoint: 'Potential for coached testimony',
      followUpQuestions: ['Who did you review them with?', 'Did anyone point out specific things you should remember?'],
      documentReference: docNames,
    },
    {
      id: uuidv4(),
      question: `Is there any information relevant to this case that is NOT contained in these documents?`,
      category: 'foundation',
      difficulty: 'hard',
      suggestedApproach: 'Disclose any relevant information not in the documents.',
      weakPoint: 'Incomplete documentary record',
      followUpQuestions: ['Why wasn\'t that information documented?', 'Who else might know about this undocumented information?'],
      documentReference: docNames,
    },
    // General cross-examination questions (5) - REQUIRED
    {
      id: uuidv4(),
      question: `How did you prepare for your testimony today?`,
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Be honest about preparation. It\'s normal to review documents with counsel.',
      weakPoint: 'May suggest coaching',
      followUpQuestions: ['Who did you meet with to prepare?', 'How many times did you meet with them?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Are you being compensated in any way for your testimony, or do you have any financial interest in the outcome of this case?`,
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Answer directly. Expert witnesses are typically compensated; fact witnesses usually are not.',
      weakPoint: 'Potential bias',
      followUpQuestions: ['How much are you being paid?', 'Does your compensation depend on the outcome of this case?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `What is your relationship to the parties in this case?`,
      category: 'general',
      difficulty: 'easy',
      suggestedApproach: 'Describe relationships factually without editorializing.',
      weakPoint: 'Potential bias based on relationships',
      followUpQuestions: ['How long have you known them?', 'Have you ever had any conflicts with them?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `How would you describe your memory in general? Is there anything about your testimony today that you're not completely certain about?`,
      category: 'general',
      difficulty: 'medium',
      suggestedApproach: 'Be honest about your memory capabilities. It\'s okay to acknowledge uncertainty.',
      weakPoint: 'Self-assessment of reliability',
      followUpQuestions: ['What specifically are you uncertain about?', 'Have you ever forgotten important details in the past?'],
      documentReference: 'General Cross-Examination',
    },
    {
      id: uuidv4(),
      question: `Have you ever given testimony in any proceeding that was later found to be inaccurate or that you needed to correct?`,
      category: 'general',
      difficulty: 'hard',
      suggestedApproach: 'Answer honestly. If yes, explain the circumstances.',
      weakPoint: 'Prior credibility issues',
      followUpQuestions: ['What were the circumstances of that inaccuracy?', 'How did you discover that your testimony was inaccurate?'],
      documentReference: 'General Cross-Examination',
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
Witness Name: ${session.witnessName}

DOCUMENTS TO ANALYZE:
${documentContext}

Generate exactly 20 cross-examination questions for the witness ${session.witnessName}.

CRITICAL REQUIREMENTS:
1. ALL questions must be directed TO the witness (${session.witnessName}) - use "you" and "your" to address them
2. Do NOT start every question with the witness's name - this is repetitive. Use natural questioning style.
3. ALL follow-up questions must also be directed to the witness - ask about THEIR knowledge, actions, or observations
4. When documents mention other people, ask the witness about their knowledge of those people
5. Generate 15 DOCUMENT-SPECIFIC questions that reference specific facts, names, dates, times, or details from the documents
6. Generate exactly 5 GENERAL cross-examination questions (category: "general") about:
   - How the witness prepared for testimony
   - Compensation or financial interest
   - Memory and certainty
   - Relationship to parties
   - Prior inaccurate testimony

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
          model: 'casemark/casemark-core-1',
          messages: [
            { role: 'system', content: getQuestionGenerationPrompt(session.witnessName) },
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
