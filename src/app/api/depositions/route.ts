import { NextRequest, NextResponse } from 'next/server';
import { createDepositionSession, getAllDepositionSessions, serializeDepositionSession } from '@/lib/deposition-store';

// Input validation constants
const MAX_NAME_LENGTH = 200;
const MAX_CASE_NUMBER_LENGTH = 100;

// Sanitize string input - remove potentially dangerous characters
function sanitizeInput(input: string, maxLength: number = MAX_NAME_LENGTH): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ''); // Remove angle brackets to prevent XSS
}

// Validate name format
function isValidName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  const sanitized = sanitizeInput(name);
  return sanitized.length > 0 && sanitized.length <= MAX_NAME_LENGTH;
}

// Validate case number format (optional field, but if provided must be valid)
function isValidCaseNumber(caseNumber: string | undefined): boolean {
  if (caseNumber === undefined || caseNumber === null || caseNumber === '') return true;
  if (typeof caseNumber !== 'string') return false;
  const sanitized = sanitizeInput(caseNumber, MAX_CASE_NUMBER_LENGTH);
  return sanitized.length <= MAX_CASE_NUMBER_LENGTH;
}

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
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }
    
    const { deponentName, caseName, caseNumber } = body;
    
    if (!deponentName || !caseName) {
      return NextResponse.json(
        { error: 'deponentName and caseName are required' },
        { status: 400 }
      );
    }
    
    // Validate inputs
    if (!isValidName(deponentName)) {
      return NextResponse.json(
        { error: 'Invalid deponent name. Maximum 200 characters allowed.' },
        { status: 400 }
      );
    }
    
    if (!isValidName(caseName)) {
      return NextResponse.json(
        { error: 'Invalid case name. Maximum 200 characters allowed.' },
        { status: 400 }
      );
    }
    
    if (!isValidCaseNumber(caseNumber)) {
      return NextResponse.json(
        { error: 'Invalid case number. Maximum 100 characters allowed.' },
        { status: 400 }
      );
    }
    
    // Sanitize inputs
    const sanitizedDeponentName = sanitizeInput(deponentName);
    const sanitizedCaseName = sanitizeInput(caseName);
    const sanitizedCaseNumber = caseNumber ? sanitizeInput(caseNumber, MAX_CASE_NUMBER_LENGTH) : undefined;
    
    const session = createDepositionSession(sanitizedDeponentName, sanitizedCaseName, sanitizedCaseNumber);
    
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
