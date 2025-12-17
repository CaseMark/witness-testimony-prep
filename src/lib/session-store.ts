// In-memory session store for Testimony Prep Tool
// In production, this would be backed by a database

import { v4 as uuidv4 } from 'uuid';
import { PracticeSession, Document, CrossExamQuestion, PracticeExchange } from './types';

// In-memory storage
const sessions: Map<string, PracticeSession> = new Map();

export function createSession(witnessName: string, caseName: string): PracticeSession {
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
