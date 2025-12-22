import { NextRequest, NextResponse } from 'next/server';
import { createSession, getAllSessions, serializeSession } from '@/lib/session-store';

// Input validation constants
const MAX_NAME_LENGTH = 200;
const NAME_PATTERN = /^[\w\s\-.,'"()]+$/; // Allow alphanumeric, spaces, and common punctuation

// Sanitize string input - remove potentially dangerous characters
function sanitizeInput(input: string): string {
  return input
    .trim()
    .slice(0, MAX_NAME_LENGTH)
    .replace(/[<>]/g, ''); // Remove angle brackets to prevent XSS
}

// Validate name format
function isValidName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const sanitized = sanitizeInput(name);
  return sanitized.length > 0 && sanitized.length <= MAX_NAME_LENGTH;
}

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
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    
    const { witnessName, caseName } = body;
    
    if (!witnessName || !caseName) {
      return NextResponse.json(
        { error: 'witnessName and caseName are required' },
        { status: 400 }
      );
    }
    
    // Validate inputs
    if (!isValidName(witnessName)) {
      return NextResponse.json(
        { error: 'Invalid witness name. Maximum 200 characters allowed.' },
        { status: 400 }
      );
    }
    
    if (!isValidName(caseName)) {
      return NextResponse.json(
        { error: 'Invalid case name. Maximum 200 characters allowed.' },
        { status: 400 }
      );
    }
    
    // Sanitize inputs
    const sanitizedWitnessName = sanitizeInput(witnessName);
    const sanitizedCaseName = sanitizeInput(caseName);
    
    const session = createSession(sanitizedWitnessName, sanitizedCaseName);
    
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
