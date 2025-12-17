import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { 
  getDepositionSession, 
  createOutline, 
  addOutlineSection, 
  updateOutlineSection,
  reorderOutlineSections,
  addQuestionToSection,
  removeQuestionFromSection,
  updateDepositionSession,
  serializeDepositionSession 
} from '@/lib/deposition-store';
import { DepositionQuestion, OutlineSection } from '@/lib/deposition-types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/depositions/[sessionId]/outline - Get the deposition outline
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getDepositionSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      outline: session.outline,
    });
  } catch (error) {
    console.error('Error fetching outline:', error);
    return NextResponse.json(
      { error: 'Failed to fetch outline' },
      { status: 500 }
    );
  }
}

// POST /api/depositions/[sessionId]/outline - Create or update outline
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
    
    const body = await request.json();
    const { action, title, section, sectionId, sectionIds, question, questionId } = body;
    
    let updatedSession;
    
    switch (action) {
      case 'create':
        // Create a new outline
        if (!title) {
          return NextResponse.json(
            { error: 'Title is required to create an outline' },
            { status: 400 }
          );
        }
        updatedSession = createOutline(sessionId, title);
        break;
        
      case 'add_section':
        // Add a new section to the outline
        if (!session.outline) {
          return NextResponse.json(
            { error: 'No outline exists. Create an outline first.' },
            { status: 400 }
          );
        }
        if (!section || !section.title) {
          return NextResponse.json(
            { error: 'Section title is required' },
            { status: 400 }
          );
        }
        const newSection: Omit<OutlineSection, 'id'> = {
          title: section.title,
          order: session.outline.sections.length,
          questions: section.questions || [],
          notes: section.notes,
          estimatedTime: section.estimatedTime,
        };
        updatedSession = addOutlineSection(sessionId, newSection);
        break;
        
      case 'update_section':
        // Update an existing section
        if (!sectionId) {
          return NextResponse.json(
            { error: 'Section ID is required' },
            { status: 400 }
          );
        }
        updatedSession = updateOutlineSection(sessionId, sectionId, section);
        break;
        
      case 'reorder_sections':
        // Reorder sections
        if (!sectionIds || !Array.isArray(sectionIds)) {
          return NextResponse.json(
            { error: 'Section IDs array is required' },
            { status: 400 }
          );
        }
        updatedSession = reorderOutlineSections(sessionId, sectionIds);
        break;
        
      case 'add_question':
        // Add a question to a section
        if (!sectionId || !question) {
          return NextResponse.json(
            { error: 'Section ID and question are required' },
            { status: 400 }
          );
        }
        const questionToAdd: DepositionQuestion = {
          id: question.id || uuidv4(),
          question: question.question,
          topic: question.topic || 'General',
          category: question.category || 'general',
          priority: question.priority || 'medium',
          documentReference: question.documentReference,
          pageReference: question.pageReference,
          rationale: question.rationale,
          followUpQuestions: question.followUpQuestions,
          exhibitToShow: question.exhibitToShow,
        };
        updatedSession = addQuestionToSection(sessionId, sectionId, questionToAdd);
        break;
        
      case 'remove_question':
        // Remove a question from a section
        if (!sectionId || !questionId) {
          return NextResponse.json(
            { error: 'Section ID and question ID are required' },
            { status: 400 }
          );
        }
        updatedSession = removeQuestionFromSection(sessionId, sectionId, questionId);
        break;
        
      case 'auto_organize':
        // Auto-organize questions into sections by topic
        if (!session.questions || session.questions.length === 0) {
          return NextResponse.json(
            { error: 'No questions available to organize' },
            { status: 400 }
          );
        }
        
        // Create outline if it doesn't exist
        if (!session.outline) {
          createOutline(sessionId, `Deposition Outline - ${session.deponentName}`);
        }
        
        // Group questions by topic
        const questionsByTopic = new Map<string, DepositionQuestion[]>();
        for (const q of session.questions) {
          const topic = q.topic || 'General';
          if (!questionsByTopic.has(topic)) {
            questionsByTopic.set(topic, []);
          }
          questionsByTopic.get(topic)!.push(q);
        }
        
        // Create sections for each topic
        let order = 0;
        const topicOrder = [
          'Foundation',
          'Preparation',
          'Timeline of Events',
          'Document Authentication',
          'Communications',
          'Document Discovery',
          'Prior Statements',
          'Bias and Interest',
          'Credibility',
          'Closing',
        ];
        
        // Sort topics by predefined order, then alphabetically for others
        const sortedTopics = Array.from(questionsByTopic.keys()).sort((a, b) => {
          const aIndex = topicOrder.indexOf(a);
          const bIndex = topicOrder.indexOf(b);
          if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
          if (aIndex !== -1) return -1;
          if (bIndex !== -1) return 1;
          return a.localeCompare(b);
        });
        
        for (const topic of sortedTopics) {
          const questions = questionsByTopic.get(topic)!;
          // Sort questions within topic by priority
          questions.sort((a, b) => {
            const priorityOrder = { high: 0, medium: 1, low: 2 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
          });
          
          const sectionData: Omit<OutlineSection, 'id'> = {
            title: topic,
            order: order++,
            questions,
            estimatedTime: Math.ceil(questions.length * 3), // Estimate 3 minutes per question
          };
          addOutlineSection(sessionId, sectionData);
        }
        
        updatedSession = getDepositionSession(sessionId);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action. Use: create, add_section, update_section, reorder_sections, add_question, remove_question, or auto_organize' },
          { status: 400 }
        );
    }
    
    if (!updatedSession) {
      return NextResponse.json(
        { error: 'Failed to update outline' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      outline: updatedSession.outline,
      session: serializeDepositionSession(updatedSession),
    });
  } catch (error) {
    console.error('Error updating outline:', error);
    return NextResponse.json(
      { error: 'Failed to update outline' },
      { status: 500 }
    );
  }
}

// DELETE /api/depositions/[sessionId]/outline - Delete the outline
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getDepositionSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
        { status: 404 }
      );
    }
    
    const updatedSession = updateDepositionSession(sessionId, { outline: null });
    
    return NextResponse.json({
      success: true,
      session: updatedSession ? serializeDepositionSession(updatedSession) : null,
    });
  } catch (error) {
    console.error('Error deleting outline:', error);
    return NextResponse.json(
      { error: 'Failed to delete outline' },
      { status: 500 }
    );
  }
}
