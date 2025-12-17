import { NextRequest, NextResponse } from 'next/server';
import { getDepositionSession, updateDepositionSession, deleteDepositionSession, serializeDepositionSession } from '@/lib/deposition-store';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// GET /api/depositions/[sessionId] - Get a specific deposition session
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
      session: serializeDepositionSession(session),
    });
  } catch (error) {
    console.error('Error fetching deposition session:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deposition session' },
      { status: 500 }
    );
  }
}

// PATCH /api/depositions/[sessionId] - Update a deposition session
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const body = await request.json();
    
    const session = getDepositionSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
        { status: 404 }
      );
    }
    
    const updatedSession = updateDepositionSession(sessionId, body);
    
    return NextResponse.json({
      session: updatedSession ? serializeDepositionSession(updatedSession) : null,
    });
  } catch (error) {
    console.error('Error updating deposition session:', error);
    return NextResponse.json(
      { error: 'Failed to update deposition session' },
      { status: 500 }
    );
  }
}

// DELETE /api/depositions/[sessionId] - Delete a deposition session
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    
    const deleted = deleteDepositionSession(sessionId);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting deposition session:', error);
    return NextResponse.json(
      { error: 'Failed to delete deposition session' },
      { status: 500 }
    );
  }
}
