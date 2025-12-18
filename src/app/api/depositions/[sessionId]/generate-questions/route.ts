import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDepositionSession, setDepositionQuestions, setAnalysisResults, updateDepositionSession, serializeDepositionSession } from '@/lib/deposition-store';
import { DepositionQuestion, TestimonyGap, Contradiction } from '@/lib/deposition-types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

const DEPOSITION_ANALYSIS_PROMPT = `You are an experienced litigation attorney preparing to take a deposition. Your task is to analyze the provided case documents and generate strategic deposition questions that are SPECIFIC to the document contents.

CRITICAL REQUIREMENTS:
- ALL questions MUST be directed TO THE DEPONENT (the witness being deposed). Address them directly using "you" and "your"
- ALL questions MUST reference specific facts, statements, dates, names, or details from the uploaded documents
- When other people are mentioned in documents, ask the DEPONENT about their knowledge of or interactions with those people
- DO NOT include generic introductory questions like "state your name for the record" or "have you given a deposition before"
- DO NOT include document authentication questions like "do you recognize this document"
- DO NOT include generic closing questions like "is there anything else you'd like to add"
- Every question should probe specific content from the documents

ANALYSIS OBJECTIVES:
1. Identify GAPS in testimony - areas where information is missing, vague, or incomplete based on document content
2. Detect CONTRADICTIONS - inconsistencies between documents, statements, or with known facts
3. Extract KEY THEMES - major topics and issues that emerge from the documents
4. Build a TIMELINE - chronological events mentioned in the documents
5. Generate STRATEGIC QUESTIONS - questions that reference specific document content to expose weaknesses and establish facts

FOR EACH QUESTION, provide:
1. The question itself - MUST reference specific facts, quotes, dates, or details from the documents
2. Topic: The subject area based on document content
3. Category: one of "gap", "contradiction", "timeline", "foundation", "impeachment", "follow_up", or "general"
4. Priority: "high", "medium", or "low" based on strategic importance
5. Document reference: Which specific document this relates to
6. Page reference: Specific page or section if identifiable
7. Rationale: Why this question is important based on what the documents reveal
8. Follow-up questions: 2-3 potential follow-up questions based on likely answers
9. Exhibit to show: If applicable, which exhibit should be shown when asking this question

QUESTION EXAMPLES (good vs bad):
BAD: "Please state your name for the record."
GOOD: "In the email dated March 15th, you wrote 'I was not aware of the safety concerns.' Can you explain what you meant by that?"

BAD: "Do you recognize this document?"
GOOD: "On page 3 of your prior deposition, you stated you never met with Mr. Johnson. But this email shows a meeting scheduled for June 10th. Can you explain this discrepancy?"

BAD: "What is your relationship to the parties?"
GOOD: "The contract identifies you as the 'Project Lead.' What specific responsibilities did that role entail during the period from January to March 2024?"

Return your response as a JSON object with this structure:
{
  "gaps": [
    {
      "description": "Description of the gap with specific document references",
      "documentReferences": ["Document names"],
      "severity": "minor|moderate|significant",
      "suggestedQuestions": ["Specific question 1", "Specific question 2"]
    }
  ],
  "contradictions": [
    {
      "description": "Description of the contradiction with specific quotes",
      "source1": { "document": "Doc name", "excerpt": "Exact quote from document", "page": "Page ref" },
      "source2": { "document": "Doc name", "excerpt": "Exact quote from document", "page": "Page ref" },
      "severity": "minor|moderate|significant",
      "suggestedQuestions": ["Specific question about the contradiction"]
    }
  ],
  "analysis": {
    "keyThemes": ["Theme 1 from documents", "Theme 2 from documents"],
    "timelineEvents": [{ "date": "Specific date from docs", "event": "Event description", "source": "Document" }],
    "witnesses": ["Witness names mentioned in documents"],
    "keyExhibits": ["Important exhibits referenced"]
  },
  "questions": [
    {
      "question": "Question that references specific document content",
      "topic": "Topic area from documents",
      "category": "gap|contradiction|timeline|foundation|impeachment|follow_up|general",
      "priority": "high|medium|low",
      "documentReference": "Document name",
      "pageReference": "Page or section",
      "rationale": "Why this question matters based on document content",
      "followUpQuestions": ["Follow-up 1", "Follow-up 2"],
      "exhibitToShow": "Exhibit name if applicable"
    }
  ]
}

IMPORTANT: 
- Return ONLY the JSON object. No markdown, no code blocks, no explanatory text.
- Every question MUST reference specific content from the provided documents.
- Generate 15-20 substantive questions that probe the specific facts in the documents.`;

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

// Extract key details from document content for fallback questions
function extractDocumentDetails(documents: Array<{ name: string; content?: string; type: string }>): {
  names: string[];
  dates: string[];
  amounts: string[];
  locations: string[];
  keyPhrases: string[];
  documentSummaries: Array<{ name: string; summary: string }>;
} {
  const names: Set<string> = new Set();
  const dates: Set<string> = new Set();
  const amounts: Set<string> = new Set();
  const locations: Set<string> = new Set();
  const keyPhrases: Set<string> = new Set();
  const documentSummaries: Array<{ name: string; summary: string }> = [];

  for (const doc of documents) {
    const content = doc.content || '';
    
    // Extract names (capitalized words that look like names)
    const nameMatches = content.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g) || [];
    nameMatches.slice(0, 5).forEach(n => names.add(n));
    
    // Extract dates
    const dateMatches = content.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/gi) || [];
    dateMatches.slice(0, 5).forEach(d => dates.add(d));
    
    // Extract monetary amounts
    const amountMatches = content.match(/\$[\d,]+(?:\.\d{2})?|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\s*(?:dollars?|USD)?\b/gi) || [];
    amountMatches.slice(0, 3).forEach(a => amounts.add(a));
    
    // Extract locations (common patterns)
    const locationMatches = content.match(/\b(?:in|at|from|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:,\s*[A-Z]{2})?)\b/g) || [];
    locationMatches.slice(0, 3).forEach(l => locations.add(l.replace(/^(?:in|at|from|to)\s+/i, '')));
    
    // Extract key phrases (quoted text or emphasized statements)
    const phraseMatches = content.match(/"[^"]{10,100}"|'[^']{10,100}'|stated that [^.]{10,80}|claimed that [^.]{10,80}|testified that [^.]{10,80}/gi) || [];
    phraseMatches.slice(0, 3).forEach(p => keyPhrases.add(p));
    
    // Create document summary (first meaningful sentences)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20).slice(0, 2);
    if (sentences.length > 0) {
      documentSummaries.push({
        name: doc.name,
        summary: sentences.join('. ').trim().substring(0, 200)
      });
    }
  }

  return {
    names: Array.from(names),
    dates: Array.from(dates),
    amounts: Array.from(amounts),
    locations: Array.from(locations),
    keyPhrases: Array.from(keyPhrases),
    documentSummaries
  };
}

// Generate fallback questions based on document content - now document-specific
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
  const details = extractDocumentDetails(documents);
  
  const gaps: TestimonyGap[] = [];
  const contradictions: Contradiction[] = [];
  const questions: DepositionQuestion[] = [];

  // Generate document-specific gap analysis
  if (details.dates.length > 0) {
    gaps.push({
      id: uuidv4(),
      description: `Timeline details around ${details.dates[0]} need clarification - the documents reference this date but lack context about what specifically occurred`,
      documentReferences: docNames.slice(0, 2),
      severity: 'moderate',
      suggestedQuestions: [
        `What specifically happened on ${details.dates[0]}?`,
        `Who else was involved in the events of ${details.dates[0]}?`,
        `What led up to the events on ${details.dates[0]}?`
      ],
    });
  }

  if (details.names.length > 1) {
    gaps.push({
      id: uuidv4(),
      description: `The relationship and communications between ${details.names[0]} and ${details.names[1]} are not fully documented`,
      documentReferences: docNames.slice(0, 1),
      severity: 'significant',
      suggestedQuestions: [
        `What was the nature of your communications with ${details.names[1]}?`,
        `How often did you interact with ${details.names[1]} during this period?`,
        `Were there any undocumented conversations with ${details.names[1]}?`
      ],
    });
  }

  // Generate document-specific questions based on extracted content
  
  // Questions about specific dates mentioned
  details.dates.forEach((date, index) => {
    if (index < 3) {
      questions.push({
        id: uuidv4(),
        question: `The documents reference ${date}. Walk me through exactly what happened on that date and your involvement.`,
        topic: 'Timeline of Events',
        category: 'timeline',
        priority: index === 0 ? 'high' : 'medium',
        documentReference: docNames[0],
        rationale: `This date appears in the documents and establishing the specific events is critical to understanding the sequence of events.`,
        followUpQuestions: [
          `Who else was present on ${date}?`,
          `What communications occurred before and after ${date}?`,
          `Do you have any documents from ${date} that haven't been produced?`
        ],
      });
    }
  });

  // Questions about specific people mentioned - directed TO the deponent
  details.names.forEach((name, index) => {
    if (index < 3 && name !== deponentName) {
      questions.push({
        id: uuidv4(),
        question: `${deponentName}, the documents mention ${name}. Please describe your relationship with ${name} and any interactions you had with them regarding this matter.`,
        topic: 'Witness Relationships',
        category: 'foundation',
        priority: index === 0 ? 'high' : 'medium',
        documentReference: docNames[0],
        rationale: `${name} appears to be a key individual in the documents and understanding the deponent's interactions with them is essential.`,
        followUpQuestions: [
          `When did you last communicate with ${name}?`,
          `What did ${name} tell you about this matter?`,
          `Did you ever have any disagreements with ${name} about this?`
        ],
      });
    }
  });

  // Questions about monetary amounts
  details.amounts.forEach((amount, index) => {
    if (index < 2) {
      questions.push({
        id: uuidv4(),
        question: `The documents reference ${amount}. Explain what this amount represents and how it was determined.`,
        topic: 'Financial Details',
        category: 'foundation',
        priority: 'high',
        documentReference: docNames[0],
        rationale: `Financial details are often central to disputes and this specific amount needs explanation.`,
        followUpQuestions: [
          `Who approved this amount?`,
          `Were there any disputes about ${amount}?`,
          `How was ${amount} calculated?`
        ],
      });
    }
  });

  // Questions about key phrases/statements
  details.keyPhrases.forEach((phrase, index) => {
    if (index < 3) {
      const cleanPhrase = phrase.replace(/^["']|["']$/g, '').substring(0, 100);
      questions.push({
        id: uuidv4(),
        question: `The documents contain the statement: "${cleanPhrase}..." What did you mean by this and what were the circumstances?`,
        topic: 'Prior Statements',
        category: 'impeachment',
        priority: 'high',
        documentReference: docNames[0],
        rationale: `This statement from the documents may be significant and the deponent should explain its context.`,
        followUpQuestions: [
          `Do you stand by this statement today?`,
          `Who else was aware of this?`,
          `What happened as a result of this?`
        ],
      });
    }
  });

  // Questions about document summaries
  details.documentSummaries.forEach((docSummary, index) => {
    if (index < 2) {
      questions.push({
        id: uuidv4(),
        question: `Looking at ${docSummary.name}, it discusses: "${docSummary.summary}..." What is your understanding of this and your role in it?`,
        topic: 'Document Content',
        category: 'foundation',
        priority: 'high',
        documentReference: docSummary.name,
        rationale: `This document contains key information that the deponent should explain.`,
        followUpQuestions: [
          `Were you involved in creating this document?`,
          `Is the information in this document accurate?`,
          `What actions were taken based on this document?`
        ],
      });
    }
  });

  // Add gap-filling questions based on document types
  const priorTestimonyDocs = documents.filter(d => d.type === 'prior_testimony' || d.type === 'transcript');
  if (priorTestimonyDocs.length > 0) {
    questions.push({
      id: uuidv4(),
      question: `In your prior testimony in ${priorTestimonyDocs[0].name}, you made certain statements. Have any of your recollections changed since then?`,
      topic: 'Prior Testimony',
      category: 'impeachment',
      priority: 'high',
      documentReference: priorTestimonyDocs[0].name,
      rationale: `Comparing current testimony to prior statements can reveal inconsistencies.`,
      followUpQuestions: [
        `What specifically has changed in your recollection?`,
        `Why do you remember things differently now?`,
        `Have you reviewed your prior testimony before today?`
      ],
    });
  }

  // Add questions about gaps in the documentary record
  questions.push({
    id: uuidv4(),
    question: `The documents produced cover certain time periods but there appear to be gaps. What communications or documents exist from the periods not covered?`,
    topic: 'Document Gaps',
    category: 'gap',
    priority: 'high',
    documentReference: docNames[0],
    rationale: `Identifying missing documents is critical to understanding the complete picture.`,
    followUpQuestions: [
      `Were any documents destroyed or deleted?`,
      `Who else might have relevant documents?`,
      `What was your document retention practice during this period?`
    ],
  });

  // Add contradiction-probing questions if we have multiple documents
  if (documents.length > 1) {
    questions.push({
      id: uuidv4(),
      question: `I've reviewed ${docNames[0]} and ${docNames[1]}. There appear to be differences in how events are described. Can you explain any discrepancies between these documents?`,
      topic: 'Document Consistency',
      category: 'contradiction',
      priority: 'high',
      documentReference: docNames[0],
      rationale: `Multiple documents may contain inconsistent information that needs explanation.`,
      followUpQuestions: [
        `Which document is more accurate?`,
        `When were each of these documents created?`,
        `Who else reviewed these documents?`
      ],
    });
  }

  // Ensure we have at least 10 questions
  while (questions.length < 10) {
    const docIndex = questions.length % documents.length;
    const doc = documents[docIndex];
    questions.push({
      id: uuidv4(),
      question: `Regarding ${doc.name}, explain your involvement in the matters described in this document and what actions you took.`,
      topic: 'Document Involvement',
      category: 'foundation',
      priority: 'medium',
      documentReference: doc.name,
      rationale: `Understanding the deponent's specific involvement with each document is essential.`,
      followUpQuestions: [
        `What was your role in creating or receiving this document?`,
        `Who else was involved?`,
        `What happened after this document was created?`
      ],
    });
  }

  const analysis = {
    keyThemes: details.names.length > 0 
      ? [`Involvement of ${details.names.slice(0, 2).join(' and ')}`, 'Timeline of Events', 'Document Authenticity']
      : ['Timeline of Events', 'Document Authenticity', 'Communications'],
    timelineEvents: details.dates.map((date, i) => ({
      date,
      event: `Event referenced in documents`,
      source: docNames[i % docNames.length]
    })),
    witnesses: details.names.slice(0, 5),
    keyExhibits: docNames.slice(0, 5),
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
Deponent (Witness Name): ${session.deponentName}
${session.caseNumber ? `Case Number: ${session.caseNumber}` : ''}

DOCUMENTS TO ANALYZE:
${documentContext}

Based on these documents, perform a comprehensive analysis and generate 15-20 strategic deposition questions.

CRITICAL REQUIREMENTS:
- ALL questions MUST be directed TO ${session.deponentName} (the deponent/witness). Use "you" and "your" to address them directly.
- When other people are mentioned in documents, ask ${session.deponentName} about their knowledge of or interactions with those people - do NOT ask questions about those other people as if they were the witness.
- Every question MUST reference specific facts, dates, names, quotes, or details from the documents above
- DO NOT include generic questions like "state your name" or "do you recognize this document"
- DO NOT include procedural questions about deposition experience
- Focus on substantive questions that probe the specific content of these documents

Focus on:
1. Identifying gaps in the testimony or evidence based on document content
2. Finding contradictions between documents or statements
3. Building a clear timeline of events from the documents
4. Preparing questions that reference specific document content to establish key facts and expose weaknesses

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
          model: 'anthropic/claude-sonnet-4-20250514',
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
