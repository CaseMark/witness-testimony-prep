// Core types for Deposition Prep Tool
// For opposing counsel to prepare deposition questions

export interface DepositionDocument {
  id: string;
  name: string;
  type: 'prior_testimony' | 'exhibit' | 'transcript' | 'case_file' | 'other';
  fileType: string;
  size: number;
  uploadedAt: Date;
  objectId?: string;
  content?: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  metadata?: {
    witness?: string;
    date?: string;
    pageCount?: number;
    source?: string;
  };
}

export interface TestimonyGap {
  id: string;
  description: string;
  documentReferences: string[];
  severity: 'minor' | 'moderate' | 'significant';
  suggestedQuestions: string[];
}

export interface Contradiction {
  id: string;
  description: string;
  source1: {
    document: string;
    excerpt: string;
    page?: string;
  };
  source2: {
    document: string;
    excerpt: string;
    page?: string;
  };
  severity: 'minor' | 'moderate' | 'significant';
  suggestedQuestions: string[];
}

export interface DepositionQuestion {
  id: string;
  question: string;
  topic: string;
  category: 'gap' | 'contradiction' | 'timeline' | 'foundation' | 'impeachment' | 'follow_up' | 'general';
  priority: 'high' | 'medium' | 'low';
  documentReference?: string;
  pageReference?: string;
  rationale?: string;
  followUpQuestions?: string[];
  exhibitToShow?: string;
}

export interface OutlineSection {
  id: string;
  title: string;
  order: number;
  questions: DepositionQuestion[];
  notes?: string;
  estimatedTime?: number; // in minutes
}

export interface DepositionOutline {
  id: string;
  title: string;
  sections: OutlineSection[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DepositionSession {
  id: string;
  deponentName: string;
  caseName: string;
  caseNumber?: string;
  depositionDate?: Date;
  createdAt: Date;
  documents: DepositionDocument[];
  gaps: TestimonyGap[];
  contradictions: Contradiction[];
  questions: DepositionQuestion[];
  outline: DepositionOutline | null;
  status: 'setup' | 'uploading' | 'analyzing' | 'ready' | 'completed';
  analysis?: {
    keyThemes: string[];
    timelineEvents: Array<{
      date: string;
      event: string;
      source: string;
    }>;
    witnesses: string[];
    keyExhibits: string[];
  };
}

export interface QuestionGenerationRequest {
  documents: Array<{ name: string; content: string; type: string }>;
  deponentName: string;
  caseName: string;
  focusAreas?: string[];
  existingQuestions?: string[];
}

export interface AnalysisResult {
  gaps: TestimonyGap[];
  contradictions: Contradiction[];
  keyThemes: string[];
  timelineEvents: Array<{
    date: string;
    event: string;
    source: string;
  }>;
  witnesses: string[];
  keyExhibits: string[];
}

export interface ExportOptions {
  format: 'docx' | 'pdf' | 'txt';
  includeCitations: boolean;
  includeRationale: boolean;
  includeFollowUps: boolean;
  groupByTopic: boolean;
}
