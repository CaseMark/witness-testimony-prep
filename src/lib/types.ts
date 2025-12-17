// Core types for Testimony Prep Tool

export interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: Date;
  objectId?: string;
  content?: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
}

export interface CrossExamQuestion {
  id: string;
  question: string;
  category: 'timeline' | 'credibility' | 'inconsistency' | 'foundation' | 'impeachment' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  suggestedApproach?: string;
  weakPoint?: string;
  followUpQuestions?: string[];
  documentReference?: string;
}

export interface PracticeSession {
  id: string;
  witnessName: string;
  caseName: string;
  createdAt: Date;
  documents: Document[];
  questions: CrossExamQuestion[];
  status: 'setup' | 'generating' | 'ready' | 'practicing' | 'completed';
  practiceHistory: PracticeExchange[];
  totalDuration: number;
  recordingUrl?: string;
}

export interface PracticeExchange {
  id: string;
  questionId: string;
  question: string;
  witnessResponse: string;
  aiFollowUp?: string;
  feedback?: string;
  timestamp: Date;
  duration: number;
}

export interface SessionRecording {
  id: string;
  sessionId: string;
  audioUrl?: string;
  transcription?: string;
  status: 'recording' | 'processing' | 'completed' | 'error';
  startedAt: Date;
  endedAt?: Date;
}

export interface QuestionGenerationRequest {
  documents: { name: string; content: string }[];
  witnessName: string;
  caseName: string;
  witnessRole?: string;
  focusAreas?: string[];
}

export interface AIExaminerResponse {
  followUp?: string;
  feedback?: string;
  weaknessIdentified?: string;
  suggestedImprovement?: string;
}
