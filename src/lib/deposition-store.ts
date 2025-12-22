// In-memory session store for Deposition Prep Tool
// WARNING: In-memory storage is NOT suitable for production on Vercel
// Sessions will be lost on serverless function cold starts
// For production, use a database (PostgreSQL, Redis, etc.)

import { v4 as uuidv4 } from 'uuid';
import { 
  DepositionSession, 
  DepositionDocument, 
  DepositionQuestion, 
  TestimonyGap,
  Contradiction,
  DepositionOutline,
  OutlineSection
} from './deposition-types';

// In-memory storage - sessions will be lost on serverless cold starts
// TODO: Replace with database storage for production
const depositionSessions: Map<string, DepositionSession> = new Map();

// Session cleanup - remove sessions older than 24 hours to prevent memory leaks
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cleanupOldSessions(): void {
  const now = new Date().getTime();
  for (const [id, session] of depositionSessions.entries()) {
    if (now - new Date(session.createdAt).getTime() > SESSION_TTL_MS) {
      depositionSessions.delete(id);
    }
  }
}

export function createDepositionSession(deponentName: string, caseName: string, caseNumber?: string): DepositionSession {
  // Run cleanup on session creation to prevent memory buildup
  cleanupOldSessions();
  
  const session: DepositionSession = {
    id: uuidv4(),
    deponentName,
    caseName,
    caseNumber,
    createdAt: new Date(),
    documents: [],
    gaps: [],
    contradictions: [],
    questions: [],
    outline: null,
    status: 'setup',
  };
  
  depositionSessions.set(session.id, session);
  return session;
}

export function getDepositionSession(sessionId: string): DepositionSession | undefined {
  return depositionSessions.get(sessionId);
}

export function getAllDepositionSessions(): DepositionSession[] {
  return Array.from(depositionSessions.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function updateDepositionSession(sessionId: string, updates: Partial<DepositionSession>): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  const updated = { ...session, ...updates };
  depositionSessions.set(sessionId, updated);
  return updated;
}

export function addDepositionDocument(sessionId: string, document: DepositionDocument): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  session.documents.push(document);
  depositionSessions.set(sessionId, session);
  return session;
}

export function updateDepositionDocument(sessionId: string, documentId: string, updates: Partial<DepositionDocument>): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  const docIndex = session.documents.findIndex(d => d.id === documentId);
  if (docIndex === -1) return undefined;
  
  session.documents[docIndex] = { ...session.documents[docIndex], ...updates };
  depositionSessions.set(sessionId, session);
  return session;
}

export function setDepositionQuestions(sessionId: string, questions: DepositionQuestion[]): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  session.questions = questions;
  session.status = 'ready';
  depositionSessions.set(sessionId, session);
  return session;
}

export function setAnalysisResults(
  sessionId: string, 
  gaps: TestimonyGap[], 
  contradictions: Contradiction[],
  analysis: DepositionSession['analysis']
): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  session.gaps = gaps;
  session.contradictions = contradictions;
  session.analysis = analysis;
  depositionSessions.set(sessionId, session);
  return session;
}

export function createOutline(sessionId: string, title: string): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session) return undefined;
  
  const outline: DepositionOutline = {
    id: uuidv4(),
    title,
    sections: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  session.outline = outline;
  depositionSessions.set(sessionId, session);
  return session;
}

export function addOutlineSection(sessionId: string, section: Omit<OutlineSection, 'id'>): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session || !session.outline) return undefined;
  
  const newSection: OutlineSection = {
    ...section,
    id: uuidv4(),
  };
  
  session.outline.sections.push(newSection);
  session.outline.updatedAt = new Date();
  depositionSessions.set(sessionId, session);
  return session;
}

export function updateOutlineSection(sessionId: string, sectionId: string, updates: Partial<OutlineSection>): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session || !session.outline) return undefined;
  
  const sectionIndex = session.outline.sections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return undefined;
  
  session.outline.sections[sectionIndex] = { ...session.outline.sections[sectionIndex], ...updates };
  session.outline.updatedAt = new Date();
  depositionSessions.set(sessionId, session);
  return session;
}

export function reorderOutlineSections(sessionId: string, sectionIds: string[]): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session || !session.outline) return undefined;
  
  const reorderedSections: OutlineSection[] = [];
  for (let i = 0; i < sectionIds.length; i++) {
    const section = session.outline.sections.find(s => s.id === sectionIds[i]);
    if (section) {
      reorderedSections.push({ ...section, order: i });
    }
  }
  
  session.outline.sections = reorderedSections;
  session.outline.updatedAt = new Date();
  depositionSessions.set(sessionId, session);
  return session;
}

export function addQuestionToSection(sessionId: string, sectionId: string, question: DepositionQuestion): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session || !session.outline) return undefined;
  
  const sectionIndex = session.outline.sections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return undefined;
  
  session.outline.sections[sectionIndex].questions.push(question);
  session.outline.updatedAt = new Date();
  depositionSessions.set(sessionId, session);
  return session;
}

export function removeQuestionFromSection(sessionId: string, sectionId: string, questionId: string): DepositionSession | undefined {
  const session = depositionSessions.get(sessionId);
  if (!session || !session.outline) return undefined;
  
  const sectionIndex = session.outline.sections.findIndex(s => s.id === sectionId);
  if (sectionIndex === -1) return undefined;
  
  session.outline.sections[sectionIndex].questions = 
    session.outline.sections[sectionIndex].questions.filter(q => q.id !== questionId);
  session.outline.updatedAt = new Date();
  depositionSessions.set(sessionId, session);
  return session;
}

export function deleteDepositionSession(sessionId: string): boolean {
  return depositionSessions.delete(sessionId);
}

// Helper to serialize session for API responses
export function serializeDepositionSession(session: DepositionSession): Record<string, unknown> {
  return {
    ...session,
    createdAt: session.createdAt.toISOString(),
    depositionDate: session.depositionDate?.toISOString(),
    documents: session.documents.map(doc => ({
      ...doc,
      uploadedAt: doc.uploadedAt.toISOString(),
    })),
    outline: session.outline ? {
      ...session.outline,
      createdAt: session.outline.createdAt.toISOString(),
      updatedAt: session.outline.updatedAt.toISOString(),
    } : null,
  };
}
