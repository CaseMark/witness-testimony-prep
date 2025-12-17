import { NextRequest, NextResponse } from 'next/server';
import { createDepositionSession, getAllDepositionSessions, serializeDepositionSession } from '@/lib/deposition-store';

// GET /api/depositions - List all deposition sessions
export async function GET() {
  try {
    const sessions = getAllDepositionSessions();
    return NextResponse.json({
      sessions: sessions.map(serializeDepositionSession),
    });
  } catch (error) {
    console.error('Error fetching deposition sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deposition sessions' },
      { status: 500 }
    );
  }
}

// POST /api/depositions - Create a new deposition session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { deponentName, caseName, caseNumber } = body;
    
    if (!deponentName || !caseName) {
      return NextResponse.json(
        { error: 'deponentName and caseName are required' },
        { status: 400 }
      );
    }
    
    const session = createDepositionSession(deponentName, caseName, caseNumber);
    
    return NextResponse.json({
      session: serializeDepositionSession(session),
    });
  } catch (error) {
    console.error('Error creating deposition session:', error);
    return NextResponse.json(
      { error: 'Failed to create deposition session' },
      { status: 500 }
    );
  }
}
