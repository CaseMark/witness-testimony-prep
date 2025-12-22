// In-memory session store for Testimony Prep Tool
// WARNING: In-memory storage is NOT suitable for production on Vercel
// Sessions will be lost on serverless function cold starts
// For production, use a database (PostgreSQL, Redis, etc.)

import { v4 as uuidv4 } from 'uuid';
import { PracticeSession, Document, CrossExamQuestion, PracticeExchange } from './types';

// In-memory storage - sessions will be lost on serverless cold starts
// TODO: Replace with database storage for production
const sessions: Map<string, PracticeSession> = new Map();

// Session cleanup - remove sessions older than 24 hours to prevent memory leaks
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanupOldSessions(): void {
  const now = new Date().getTime();
  for (const [id, session] of sessions.entries()) {
    if (now - new Date(session.createdAt).getTime() > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

export function createSession(witnessName: string, caseName: string): PracticeSession {
  // Run cleanup on session creation to prevent memory buildup
  cleanupOldSessions();
  
  const session: PracticeSession = {
    id: uuidv4(),
    witnessName,
    caseName,
    createdAt: new Date(),
    documents: [],
    questions: [],
    status: 'setup',
    practiceHistory: [],
    totalDuration: 0,
  };
  
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): PracticeSession | undefined {
  return sessions.get(sessionId);
}

export function getAllSessions(): PracticeSession[] {
  return Array.from(sessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function updateSession(sessionId: string, updates: Partial<PracticeSession>): PracticeSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  const updated = { ...session, ...updates };
  sessions.set(sessionId, updated);
  return updated;
}

export function addDocument(sessionId: string, document: Document): PracticeSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  session.documents.push(document);
  sessions.set(sessionId, session);
  return session;
}

export function updateDocument(sessionId: string, documentId: string, updates: Partial<Document>): PracticeSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  const docIndex = session.documents.findIndex(d => d.id === documentId);
  if (docIndex === -1) return undefined;
  
  session.documents[docIndex] = { ...session.documents[docIndex], ...updates };
  sessions.set(sessionId, session);
  return session;
}

export function setQuestions(sessionId: string, questions: CrossExamQuestion[]): PracticeSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  session.questions = questions;
  session.status = 'ready';
  sessions.set(sessionId, session);
  return session;
}

export function addPracticeExchange(sessionId: string, exchange: PracticeExchange): PracticeSession | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  
  session.practiceHistory.push(exchange);
  session.totalDuration += exchange.duration;
  sessions.set(sessionId, session);
  return session;
}

export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

// Helper to serialize session for API responses
export function serializeSession(session: PracticeSession): Record<string, unknown> {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    documents: session.documents.map(doc => ({
      ...doc,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),
    practiceHistory: session.practiceHistory.map(exchange => ({
      ...exchange,
      timestamp: exchange.timestamp.toISOString(),
    })),
  };
}
