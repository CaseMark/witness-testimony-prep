import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getDepositionSession, addDepositionDocument, updateDepositionDocument, serializeDepositionSession } from '@/lib/deposition-store';
import { DepositionDocument } from '@/lib/deposition-types';

// File size limit: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed file types
const ALLOWED_TYPES = [
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.doc', '.docx'];

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// Determine document type based on filename and content
function determineDocumentType(filename: string, content: string): DepositionDocument['type'] {
  const lowerName = filename.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  // Check for transcript indicators
  if (lowerName.includes('transcript') || lowerName.includes('deposition') || 
      lowerContent.includes('q:') || lowerContent.includes('a:') ||
      lowerContent.includes('question:') || lowerContent.includes('answer:')) {
    return 'transcript';
  }
  
  // Check for prior testimony
  if (lowerName.includes('testimony') || lowerName.includes('statement') ||
      lowerContent.includes('sworn') || lowerContent.includes('under oath')) {
    return 'prior_testimony';
  }
  
  // Check for exhibits
  if (lowerName.includes('exhibit') || lowerName.match(/ex[_-]?\d+/)) {
    return 'exhibit';
  }
  
  // Check for case files
  if (lowerName.includes('complaint') || lowerName.includes('motion') ||
      lowerName.includes('brief') || lowerName.includes('filing')) {
    return 'case_file';
  }
  
  return 'other';
}

// Extract metadata from document content
function extractMetadata(filename: string, content: string): DepositionDocument['metadata'] {
  const metadata: DepositionDocument['metadata'] = {};
  
  // Try to extract witness name
  const witnessMatch = content.match(/(?:witness|deponent|testimony of)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
  if (witnessMatch) {
    metadata.witness = witnessMatch[1].trim();
  }
  
  // Try to extract date
  const dateMatch = content.match(/(?:date|dated|on)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i);
  if (dateMatch) {
    metadata.date = dateMatch[1].trim();
  }
  
  // Estimate page count (rough estimate based on content length)
  const estimatedPages = Math.max(1, Math.ceil(content.length / 3000));
  metadata.pageCount = estimatedPages;
  
  // Source from filename
  metadata.source = filename;
  
  return metadata;
}

// POST /api/depositions/[sessionId]/documents - Add a document to deposition session
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getDepositionSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Deposition session not found' },
        { status: 404 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = formData.get('type') as string | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAllowedType = ALLOWED_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(fileExtension);
    
    if (!isAllowedType) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed types: TXT, PDF, DOC, DOCX' },
        { status: 400 }
      );
    }
    
    // Read file content for text-based files
    let content = '';
    if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      content = await file.text();
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      // For PDFs, we'd normally use OCR via Vaults API
      // For now, store a placeholder - in production, upload to Vault for OCR
      content = `[PDF Document: ${file.name}]`;
    } else if (file.type.includes('word') || file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      content = `[Word Document: ${file.name}]`;
    }
    
    // Determine document type
    const type = (documentType as DepositionDocument['type']) || determineDocumentType(file.name, content);
    
    // Extract metadata
    const metadata = extractMetadata(file.name, content);
    
    // Create document record
    const document: DepositionDocument = {
      id: uuidv4(),
      name: file.name,
      type,
      fileType: file.type,
      size: file.size,
      uploadedAt: new Date(),
      status: 'processing',
      metadata,
    };
    
    // Add document to session
    addDepositionDocument(sessionId, document);
    
    // Update document with content and mark as ready
    updateDepositionDocument(sessionId, document.id, {
      content,
      status: 'ready',
    });
    
    const updatedSession = getDepositionSession(sessionId);
    
    return NextResponse.json({
      document: {
        ...document,
        content,
        status: 'ready',
        uploadedAt: document.uploadedAt.toISOString(),
      },
      session: updatedSession ? serializeDepositionSession(updatedSession) : null,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

// GET /api/depositions/[sessionId]/documents - List documents in deposition session
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
      documents: session.documents.map(doc => ({
        ...doc,
        uploadedAt: doc.uploadedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
