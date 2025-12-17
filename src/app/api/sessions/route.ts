import { NextRequest, NextResponse } from 'next/server';
import { createSession, getAllSessions, serializeSession } from '@/lib/session-store';

// GET /api/sessions - List all sessions
export async function GET() {
  try {
    const sessions = getAllSessions();
    return NextResponse.json({
      sessions: sessions.map(serializeSession),
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}

// POST /api/sessions - Create a new session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { witnessName, caseName } = body;
    
    if (!witnessName || !caseName) {
      return NextResponse.json(
        { error: 'witnessName and caseName are required' },
        { status: 400 }
      );
    }
    
    const session = createSession(witnessName, caseName);
    
    return NextResponse.json({
      session: serializeSession(session),
    });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { error: 'Failed to create session' },
      { status: 500 }
    );
  }
}
