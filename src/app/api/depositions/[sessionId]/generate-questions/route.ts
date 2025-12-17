import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDepositionSession, setDepositionQuestions, setAnalysisResults, updateDepositionSession, serializeDepositionSession } from '@/lib/deposition-store';
import { DepositionQuestion, TestimonyGap, Contradiction } from '@/lib/deposition-types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const DEPOSITION_ANALYSIS_PROMPT = `You are an experienced litigation attorney preparing to take a deposition. Your task is to analyze the provided case documents and generate strategic deposition questions.

ANALYSIS OBJECTIVES:
1. Identify GAPS in testimony - areas where information is missing, vague, or incomplete
2. Detect CONTRADICTIONS - inconsistencies between documents, statements, or with known facts
3. Extract KEY THEMES - major topics and issues that emerge from the documents
4. Build a TIMELINE - chronological events mentioned in the documents
5. Generate STRATEGIC QUESTIONS - questions designed to expose weaknesses, establish facts, and build your case

FOR EACH QUESTION, provide:
1. The question itself (clear, specific, and designed for deposition)
2. Topic: The subject area (e.g., "Timeline of Events", "Employment History", "Medical Treatment")
3. Category: one of "gap", "contradiction", "timeline", "foundation", "impeachment", "follow_up", or "general"
4. Priority: "high", "medium", or "low" based on strategic importance
5. Document reference: Which document this relates to
6. Page reference: Specific page or section if identifiable
7. Rationale: Why this question is important and what you hope to establish
8. Follow-up questions: 2-3 potential follow-up questions based on likely answers
9. Exhibit to show: If applicable, which exhibit should be shown when asking this question

QUESTION STRATEGY:
- Start with foundation questions to establish basic facts
- Use timeline questions to lock in the deponent's version of events
- Ask gap questions to fill in missing information
- Save contradiction and impeachment questions for after establishing the baseline
- Include follow-up questions that anticipate evasive answers

Return your response as a JSON object with this structure:
{
  "gaps": [
    {
      "description": "Description of the gap",
      "documentReferences": ["Document names"],
      "severity": "minor|moderate|significant",
      "suggestedQuestions": ["Question 1", "Question 2"]
    }
  ],
  "contradictions": [
    {
      "description": "Description of the contradiction",
      "source1": { "document": "Doc name", "excerpt": "Quote", "page": "Page ref" },
      "source2": { "document": "Doc name", "excerpt": "Quote", "page": "Page ref" },
      "severity": "minor|moderate|significant",
      "suggestedQuestions": ["Question 1", "Question 2"]
    }
  ],
  "analysis": {
    "keyThemes": ["Theme 1", "Theme 2"],
    "timelineEvents": [{ "date": "Date", "event": "Event description", "source": "Document" }],
    "witnesses": ["Witness names mentioned"],
    "keyExhibits": ["Important exhibits"]
  },
  "questions": [
    {
      "question": "The question text",
      "topic": "Topic area",
      "category": "gap|contradiction|timeline|foundation|impeachment|follow_up|general",
      "priority": "high|medium|low",
      "documentReference": "Document name",
      "pageReference": "Page or section",
      "rationale": "Why this question matters",
      "followUpQuestions": ["Follow-up 1", "Follow-up 2"],
      "exhibitToShow": "Exhibit name if applicable"
    }
  ]
}

IMPORTANT: Return ONLY the JSON object. No markdown, no code blocks, no explanatory text.`;

// Robust JSON parsing with multiple fallback strategies
function parseJSONResponse(content: string): Record<string, unknown> | null {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Clean and parse
  try {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^\uFEFF/, '');
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
    cleaned = cleaned.replace(/\n?```\s*$/i, '');
    cleaned = cleaned.trim();
    
    const parsed = JSON.parse(cleaned);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Extract JSON object using regex
  try {
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const parsed = JSON.parse(objectMatch[0]);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch {
    // Continue to next strategy
  }

  // Strategy 4: Find first { and last } and try to parse
  try {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = content.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch {
    // All strategies failed
  }

  return null;
}

// Generate fallback questions based on document content
function generateFallbackQuestions(caseName: string, deponentName: string, documents: Array<{ name: string; content?: string; type: string }>): {
  gaps: TestimonyGap[];
  contradictions: Contradiction[];
  questions: DepositionQuestion[];
  analysis: {
    keyThemes: string[];
    timelineEvents: Array<{ date: string; event: string; source: string }>;
    witnesses: string[];
    keyExhibits: string[];
  };
} {
  const docNames = documents.map(d => d.name);
  const exhibitDocs = documents.filter(d => d.type === 'exhibit').map(d => d.name);
  const transcriptDocs = documents.filter(d => d.type === 'transcript' || d.type === 'prior_testimony').map(d => d.name);
  
  const gaps: TestimonyGap[] = [
    {
      id: uuidv4(),
      description: 'Timeline details need clarification - specific dates and times of key events',
      documentReferences: docNames.slice(0, 2),
      severity: 'moderate',
      suggestedQuestions: [
        'Can you provide the specific date when this occurred?',
        'What time of day did this happen?',
        'How long did this event last?'
      ],
    },
    {
      id: uuidv4(),
      description: 'Witness involvement and presence at key events unclear',
      documentReferences: transcriptDocs.length > 0 ? transcriptDocs : docNames.slice(0, 1),
      severity: 'significant',
      suggestedQuestions: [
        'Who else was present during this event?',
        'Did anyone else witness what you described?',
        'Have you spoken with other witnesses about this?'
      ],
    },
  ];

  const contradictions: Contradiction[] = [];
  
  if (documents.length > 1) {
    contradictions.push({
      id: uuidv4(),
      description: 'Potential inconsistency in account details across documents',
      source1: {
        document: documents[0].name,
        excerpt: 'Account provided in first document',
        page: 'Various',
      },
      source2: {
        document: documents[1].name,
        excerpt: 'Account provided in second document',
        page: 'Various',
      },
      severity: 'moderate',
      suggestedQuestions: [
        'Can you explain the difference between these two accounts?',
        'Which version is accurate?',
        'When did you first realize there was a discrepancy?'
      ],
    });
  }

  const questions: DepositionQuestion[] = [
    // Foundation questions
    {
      id: uuidv4(),
      question: `${deponentName}, please state your full name for the record.`,
      topic: 'Foundation',
      category: 'foundation',
      priority: 'high',
      rationale: 'Establish identity and begin the deposition record.',
      followUpQuestions: ['Have you ever used any other names?', 'Please spell your name for the record.'],
    },
    {
      id: uuidv4(),
      question: 'Have you ever given a deposition before?',
      topic: 'Foundation',
      category: 'foundation',
      priority: 'medium',
      rationale: 'Assess deponent experience and set expectations.',
      followUpQuestions: ['How many times?', 'In what types of cases?'],
    },
    {
      id: uuidv4(),
      question: 'How did you prepare for this deposition today?',
      topic: 'Preparation',
      category: 'foundation',
      priority: 'high',
      rationale: 'Understand what documents were reviewed and who was consulted.',
      followUpQuestions: [
        'What documents did you review?',
        'Who did you meet with to prepare?',
        'How many times did you meet with counsel?'
      ],
    },
    // Timeline questions
    {
      id: uuidv4(),
      question: `When did you first become involved in the matters at issue in ${caseName}?`,
      topic: 'Timeline of Events',
      category: 'timeline',
      priority: 'high',
      documentReference: docNames[0],
      rationale: 'Establish the starting point of deponent\'s involvement.',
      followUpQuestions: [
        'What was your role at that time?',
        'Who else was involved at that point?',
        'What were the circumstances?'
      ],
    },
    {
      id: uuidv4(),
      question: 'Can you walk me through the sequence of events as you recall them?',
      topic: 'Timeline of Events',
      category: 'timeline',
      priority: 'high',
      rationale: 'Get the deponent\'s narrative locked in before challenging specifics.',
      followUpQuestions: [
        'What happened next?',
        'How much time passed between those events?',
        'Are you certain about that order?'
      ],
    },
    // Gap questions
    {
      id: uuidv4(),
      question: 'Are there any documents related to this matter that you created but have not produced?',
      topic: 'Document Discovery',
      category: 'gap',
      priority: 'high',
      rationale: 'Identify potentially missing evidence.',
      followUpQuestions: [
        'What happened to those documents?',
        'Did you keep copies?',
        'Who else might have copies?'
      ],
    },
    {
      id: uuidv4(),
      question: 'Were there any communications about this matter that were not in writing?',
      topic: 'Communications',
      category: 'gap',
      priority: 'medium',
      rationale: 'Uncover undocumented discussions.',
      followUpQuestions: [
        'Who participated in those conversations?',
        'What was discussed?',
        'Did anyone take notes?'
      ],
    },
    // Document-specific questions
    ...docNames.slice(0, 3).map((docName, index) => ({
      id: uuidv4(),
      question: `I'm showing you what has been marked as ${exhibitDocs[index] || docName}. Do you recognize this document?`,
      topic: 'Document Authentication',
      category: 'foundation' as const,
      priority: 'high' as const,
      documentReference: docName,
      exhibitToShow: exhibitDocs[index] || docName,
      rationale: 'Authenticate documents and establish deponent\'s familiarity.',
      followUpQuestions: [
        'When did you first see this document?',
        'Did you create this document?',
        'Is this document accurate and complete?'
      ],
    })),
    // Impeachment setup questions
    {
      id: uuidv4(),
      question: 'Have you ever made any statements about this matter that you now believe were inaccurate?',
      topic: 'Prior Statements',
      category: 'impeachment',
      priority: 'medium',
      rationale: 'Open the door to impeachment with prior inconsistent statements.',
      followUpQuestions: [
        'What was inaccurate?',
        'When did you realize the inaccuracy?',
        'Did you correct the record?'
      ],
    },
    {
      id: uuidv4(),
      question: 'Is there anything about your testimony today that you are not completely certain about?',
      topic: 'Credibility',
      category: 'general',
      priority: 'medium',
      rationale: 'Assess confidence level and identify areas of uncertainty.',
      followUpQuestions: [
        'What specifically are you uncertain about?',
        'Why are you uncertain?',
        'How could we verify that information?'
      ],
    },
    // Relationship and bias questions
    {
      id: uuidv4(),
      question: 'What is your relationship to the parties in this case?',
      topic: 'Bias and Interest',
      category: 'general',
      priority: 'high',
      rationale: 'Establish potential bias or interest in the outcome.',
      followUpQuestions: [
        'How long have you known them?',
        'Do you have any financial interest in the outcome?',
        'Have you ever had any disputes with any party?'
      ],
    },
    {
      id: uuidv4(),
      question: 'Do you stand to gain or lose anything based on the outcome of this case?',
      topic: 'Bias and Interest',
      category: 'general',
      priority: 'high',
      rationale: 'Directly address potential bias.',
      followUpQuestions: [
        'Please explain.',
        'Are you being compensated for your testimony?',
        'Has anyone promised you anything in connection with this case?'
      ],
    },
    // Closing questions
    {
      id: uuidv4(),
      question: 'Is there anything else you think is important for me to know about this matter?',
      topic: 'Closing',
      category: 'general',
      priority: 'low',
      rationale: 'Allow deponent to volunteer additional information.',
      followUpQuestions: [
        'Why do you think that\'s important?',
        'Is there anything else?',
        'Have you told me everything you know?'
      ],
    },
    {
      id: uuidv4(),
      question: 'Have you answered all of my questions truthfully and to the best of your ability?',
      topic: 'Closing',
      category: 'general',
      priority: 'high',
      rationale: 'Lock in the testimony and establish the record.',
      followUpQuestions: [
        'Is there anything you would like to correct or clarify?',
        'Do you need to take a break before we conclude?'
      ],
    },
  ];

  const analysis = {
    keyThemes: ['Timeline of Events', 'Document Authentication', 'Witness Credibility', 'Communications'],
    timelineEvents: [],
    witnesses: [deponentName],
    keyExhibits: exhibitDocs.length > 0 ? exhibitDocs : docNames.slice(0, 3),
  };

  return { gaps, contradictions, questions, analysis };
}

// POST /api/depositions/[sessionId]/generate-questions - Generate deposition questions
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getDepositionSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
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
    
    // Update status to analyzing
    updateDepositionSession(sessionId, { status: 'analyzing' });
    
    // Prepare document context with full content
    const documentContext = session.documents
      .map((doc) => {
        const content = doc.content || '[Content not available - please upload a text file]';
        const typeLabel = doc.type.replace('_', ' ').toUpperCase();
        return `=== ${typeLabel}: ${doc.name} ===\n${content}\n=== END DOCUMENT ===`;
      })
      .join('\n\n');
    
    const userPrompt = `Case: ${session.caseName}
Deponent: ${session.deponentName}
${session.caseNumber ? `Case Number: ${session.caseNumber}` : ''}

DOCUMENTS TO ANALYZE:
${documentContext}

Based on these documents, perform a comprehensive analysis and generate 15-20 strategic deposition questions. Focus on:
1. Identifying gaps in the testimony or evidence
2. Finding contradictions between documents or statements
3. Building a clear timeline of events
4. Preparing questions that will establish key facts and expose weaknesses

CRITICAL: Return ONLY a valid JSON object. No markdown formatting, no code blocks, no text before or after the JSON.`;

    let result: {
      gaps: TestimonyGap[];
      contradictions: Contradiction[];
      questions: DepositionQuestion[];
      analysis: {
        keyThemes: string[];
        timelineEvents: Array<{ date: string; event: string; source: string }>;
        witnesses: string[];
        keyExhibits: string[];
      };
    };
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
            { role: 'system', content: DEPOSITION_ANALYSIS_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 8000,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('LLM API error:', errorText);
        result = generateFallbackQuestions(session.caseName, session.deponentName, session.documents);
        usedFallback = true;
      } else {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        if (!content) {
          result = generateFallbackQuestions(session.caseName, session.deponentName, session.documents);
          usedFallback = true;
        } else {
          const parsedData = parseJSONResponse(content);
          
          if (parsedData && parsedData.questions) {
            // Transform to our format with IDs
            const gaps: TestimonyGap[] = (parsedData.gaps as Array<Record<string, unknown>> || []).map((g) => ({
              id: uuidv4(),
              description: String(g.description || ''),
              documentReferences: Array.isArray(g.documentReferences) ? g.documentReferences.map(String) : [],
              severity: validateSeverity(String(g.severity || 'moderate')),
              suggestedQuestions: Array.isArray(g.suggestedQuestions) ? g.suggestedQuestions.map(String) : [],
            }));

            const contradictions: Contradiction[] = (parsedData.contradictions as Array<Record<string, unknown>> || []).map((c) => ({
              id: uuidv4(),
              description: String(c.description || ''),
              source1: {
                document: String((c.source1 as Record<string, unknown>)?.document || ''),
                excerpt: String((c.source1 as Record<string, unknown>)?.excerpt || ''),
                page: (c.source1 as Record<string, unknown>)?.page ? String((c.source1 as Record<string, unknown>).page) : undefined,
              },
              source2: {
                document: String((c.source2 as Record<string, unknown>)?.document || ''),
                excerpt: String((c.source2 as Record<string, unknown>)?.excerpt || ''),
                page: (c.source2 as Record<string, unknown>)?.page ? String((c.source2 as Record<string, unknown>).page) : undefined,
              },
              severity: validateSeverity(String(c.severity || 'moderate')),
              suggestedQuestions: Array.isArray(c.suggestedQuestions) ? c.suggestedQuestions.map(String) : [],
            }));

            const questions: DepositionQuestion[] = (parsedData.questions as Array<Record<string, unknown>>).slice(0, 20).map((q) => ({
              id: uuidv4(),
              question: String(q.question || 'Question not available'),
              topic: String(q.topic || 'General'),
              category: validateCategory(String(q.category || 'general')),
              priority: validatePriority(String(q.priority || 'medium')),
              documentReference: q.documentReference ? String(q.documentReference) : undefined,
              pageReference: q.pageReference ? String(q.pageReference) : undefined,
              rationale: q.rationale ? String(q.rationale) : undefined,
              followUpQuestions: Array.isArray(q.followUpQuestions) ? q.followUpQuestions.map(String) : undefined,
              exhibitToShow: q.exhibitToShow ? String(q.exhibitToShow) : undefined,
            }));

            const analysisData = parsedData.analysis as Record<string, unknown> || {};
            const analysis = {
              keyThemes: Array.isArray(analysisData.keyThemes) ? analysisData.keyThemes.map(String) : [],
              timelineEvents: Array.isArray(analysisData.timelineEvents) 
                ? analysisData.timelineEvents.map((e: unknown) => {
                    const event = e as Record<string, unknown>;
                    return {
                      date: String(event.date || ''),
                      event: String(event.event || ''),
                      source: String(event.source || ''),
                    };
                  })
                : [],
              witnesses: Array.isArray(analysisData.witnesses) ? analysisData.witnesses.map(String) : [],
              keyExhibits: Array.isArray(analysisData.keyExhibits) ? analysisData.keyExhibits.map(String) : [],
            };

            result = { gaps, contradictions, questions, analysis };
          } else {
            console.warn('Failed to parse LLM response, using fallback questions');
            result = generateFallbackQuestions(session.caseName, session.deponentName, session.documents);
            usedFallback = true;
          }
        }
      }
    } catch (apiError) {
      console.error('LLM API error:', apiError);
      result = generateFallbackQuestions(session.caseName, session.deponentName, session.documents);
      usedFallback = true;
    }

    // Save results to session
    setAnalysisResults(sessionId, result.gaps, result.contradictions, result.analysis);
    const updatedSession = setDepositionQuestions(sessionId, result.questions);
    
    return NextResponse.json({
      gaps: result.gaps,
      contradictions: result.contradictions,
      questions: result.questions,
      analysis: result.analysis,
      session: updatedSession ? serializeDepositionSession(updatedSession) : null,
      usedFallback,
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    return NextResponse.json(
      { error: 'Failed to generate questions' },
      { status: 500 }
    );
  }
}

function validateCategory(category: string): DepositionQuestion['category'] {
  const valid = ['gap', 'contradiction', 'timeline', 'foundation', 'impeachment', 'follow_up', 'general'];
  return valid.includes(category) ? category as DepositionQuestion['category'] : 'general';
}

function validatePriority(priority: string): DepositionQuestion['priority'] {
  const valid = ['high', 'medium', 'low'];
  return valid.includes(priority) ? priority as DepositionQuestion['priority'] : 'medium';
}

function validateSeverity(severity: string): TestimonyGap['severity'] {
  const valid = ['minor', 'moderate', 'significant'];
  return valid.includes(severity) ? severity as TestimonyGap['severity'] : 'moderate';
}
