import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSession, addDocument, updateDocument, serializeSession } from '@/lib/session-store';
import { Document } from '@/lib/types';

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

// POST /api/sessions/[sessionId]/documents - Add a document to session
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Create document record
    const document: Document = {
      id: uuidv4(),
      name: file.name,
      type: file.type,
      size: file.size,
      uploadedAt: new Date(),
      status: 'processing',
    };
    
    // Add document to session
    addDocument(sessionId, document);
    
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
    
    // Update document with content and mark as ready
    updateDocument(sessionId, document.id, {
      content,
      status: 'ready',
    });
    
    const updatedSession = getSession(sessionId);
    
    return NextResponse.json({
      document: {
        ...document,
        content,
        status: 'ready',
        uploadedAt: document.uploadedAt.toISOString(),
      },
      session: updatedSession ? serializeSession(updatedSession) : null,
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

// GET /api/sessions/[sessionId]/documents - List documents in session
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { sessionId } = await params;
    const session = getSession(sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
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
