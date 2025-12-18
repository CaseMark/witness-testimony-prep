'use client';

import { useState, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { 
  Users, 
  Upload, 
  FileText, 
  MessageSquare, 
  ChevronRight,
  Loader2,
  X,
  Lightbulb,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Search,
  List,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  Zap
} from 'lucide-react';

interface DepositionDocument {
  id: string;
  name: string;
  type: 'prior_testimony' | 'exhibit' | 'transcript' | 'case_file' | 'other';
  fileType: string;
  size: number;
  uploadedAt: string;
  status: string;
  content?: string;
  metadata?: {
    witness?: string;
    date?: string;
    pageCount?: number;
    source?: string;
  };
}

interface TestimonyGap {
  id: string;
  description: string;
  documentReferences: string[];
  severity: 'minor' | 'moderate' | 'significant';
  suggestedQuestions: string[];
}

interface Contradiction {
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

interface DepositionQuestion {
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

interface OutlineSection {
  id: string;
  title: string;
  order: number;
  questions: DepositionQuestion[];
  notes?: string;
  estimatedTime?: number;
}

interface DepositionOutline {
  id: string;
  title: string;
  sections: OutlineSection[];
  createdAt: string;
  updatedAt: string;
}

interface DepositionSession {
  id: string;
  deponentName: string;
  caseName: string;
  caseNumber?: string;
  createdAt: string;
  documents: DepositionDocument[];
  gaps: TestimonyGap[];
  contradictions: Contradiction[];
  questions: DepositionQuestion[];
  outline: DepositionOutline | null;
  status: string;
  analysis?: {
    keyThemes: string[];
    timelineEvents: Array<{ date: string; event: string; source: string }>;
    witnesses: string[];
    keyExhibits: string[];
  };
}

type AppStep = 'setup' | 'documents' | 'analysis' | 'questions' | 'outline';

export default function DepositionPrepTool() {
  // Session state
  const [session, setSession] = useState<DepositionSession | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>('setup');
  
  // Form state
  const [deponentName, setDeponentName] = useState('');
  const [caseName, setCaseName] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  
  // Loading states
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isOrganizingOutline, setIsOrganizingOutline] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  // UI state
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);

  // Clear error after timeout
  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 10000);
  };

  // Create a new session
  const createSession = async () => {
    if (!deponentName.trim() || !caseName.trim()) return;
    
    setIsCreatingSession(true);
    setError(null);
    try {
      const response = await fetch('/api/depositions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deponentName, caseName, caseNumber: caseNumber || undefined }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Failed to create session');
        return;
      }
      if (data.session) {
        setSession(data.session);
        setCurrentStep('documents');
      }
    } catch (err) {
      console.error('Error creating session:', err);
      showError('Failed to create session. Please try again.');
    } finally {
      setIsCreatingSession(false);
    }
  };

  // Reset session and go back to setup
  const resetToSetup = useCallback(() => {
    setSession(null);
    setCurrentStep('setup');
    setDeponentName('');
    setCaseName('');
    setCaseNumber('');
    setError(null);
    setExpandedQuestions(new Set());
    setSelectedTopic(null);
    setSelectedPriority(null);
  }, []);

  // Upload document
  const handleFileUpload = useCallback(async (files: FileList | null, docType?: string) => {
    if (!files || !session) return;
    
    setIsUploadingDocument(true);
    setError(null);
    
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      if (docType) {
        formData.append('type', docType);
      }
      
      try {
        const response = await fetch(`/api/depositions/${session.id}/documents`, {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 404) {
            showError('Session expired. Please start a new session.');
            resetToSetup();
            return;
          }
          showError(data.error || 'Failed to upload document');
          continue;
        }
        if (data.session) {
          setSession(data.session);
        }
      } catch (err) {
        console.error('Error uploading document:', err);
        showError('Failed to upload document. Please try again.');
      }
    }
    
    setIsUploadingDocument(false);
  }, [session, resetToSetup]);

  // Generate questions
  const generateQuestions = async () => {
    if (!session) return;
    
    setIsGeneratingQuestions(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/depositions/${session.id}/generate-questions`, {
        method: 'POST',
      });
      
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Failed to generate questions');
        return;
      }
      
      if (data.session) {
        setSession(data.session);
        setCurrentStep('analysis');
      }
    } catch (err) {
      console.error('Error generating questions:', err);
      showError('Failed to generate questions. Please check your API key and try again.');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Auto-organize outline
  const autoOrganizeOutline = async () => {
    if (!session) return;
    
    setIsOrganizingOutline(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/depositions/${session.id}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_organize' }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Failed to organize outline');
        return;
      }
      
      if (data.session) {
        setSession(data.session);
        setCurrentStep('outline');
      }
    } catch (err) {
      console.error('Error organizing outline:', err);
      showError('Failed to organize outline. Please try again.');
    } finally {
      setIsOrganizingOutline(false);
    }
  };

  // Toggle question expansion
  const toggleQuestionExpansion = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
  };

  // Get category badge class
  const getCategoryBadgeClass = (category: string) => {
    const classes: Record<string, string> = {
      gap: 'bg-purple-100 text-purple-700',
      contradiction: 'bg-red-100 text-red-700',
      timeline: 'bg-blue-100 text-blue-700',
      foundation: 'bg-green-100 text-green-700',
      impeachment: 'bg-orange-100 text-orange-700',
      follow_up: 'bg-gray-100 text-gray-700',
      general: 'bg-slate-100 text-slate-700',
    };
    return classes[category] || 'bg-gray-100 text-gray-700';
  };

  // Get priority badge class
  const getPriorityBadgeClass = (priority: string) => {
    const classes: Record<string, string> = {
      high: 'bg-red-100 text-red-700',
      medium: 'bg-yellow-100 text-yellow-700',
      low: 'bg-green-100 text-green-700',
    };
    return classes[priority] || 'bg-gray-100 text-gray-700';
  };

  // Get severity badge class
  const getSeverityBadgeClass = (severity: string) => {
    const classes: Record<string, string> = {
      significant: 'bg-red-100 text-red-700',
      moderate: 'bg-yellow-100 text-yellow-700',
      minor: 'bg-green-100 text-green-700',
    };
    return classes[severity] || 'bg-gray-100 text-gray-700';
  };

  // Get document type badge class
  const getDocTypeBadgeClass = (type: string) => {
    const classes: Record<string, string> = {
      prior_testimony: 'bg-blue-100 text-blue-700',
      exhibit: 'bg-purple-100 text-purple-700',
      transcript: 'bg-green-100 text-green-700',
      case_file: 'bg-orange-100 text-orange-700',
      other: 'bg-gray-100 text-gray-700',
    };
    return classes[type] || 'bg-gray-100 text-gray-700';
  };

  // Filter questions
  const filteredQuestions = session?.questions.filter(q => {
    if (selectedTopic && q.topic !== selectedTopic) return false;
    if (selectedPriority && q.priority !== selectedPriority) return false;
    return true;
  }) || [];

  // Get unique topics
  const uniqueTopics = [...new Set(session?.questions.map(q => q.topic) || [])];

  // Export to PDF function
  const exportToPDF = useCallback(() => {
    if (!session) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;

    // Helper function to add text with word wrap
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 10): number => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, maxWidth);
      doc.text(lines, x, y);
      return y + (lines.length * fontSize * 0.4);
    };

    // Helper function to check if we need a new page
    const checkNewPage = (requiredSpace: number): void => {
      if (yPosition + requiredSpace > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }
    };

    // Title
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('DEPOSITION OUTLINE', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 12;

    // Case info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Case: ${session.caseName}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;
    doc.text(`Deponent: ${session.deponentName}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 6;
    if (session.caseNumber) {
      doc.text(`Case No: ${session.caseNumber}`, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 6;
    }
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    // Horizontal line
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Questions - either from outline or all questions
    const questionsToExport = session.outline?.sections 
      ? session.outline.sections.flatMap((section, sectionIndex) => 
          section.questions.map((q, qIndex) => ({ ...q, sectionTitle: section.title, sectionIndex, questionIndex: qIndex }))
        )
      : session.questions.map((q, index) => ({ ...q, sectionTitle: q.topic, sectionIndex: 0, questionIndex: index }));

    let currentSection = '';
    let questionNumber = 1;

    questionsToExport.forEach((question) => {
      // Check if we need a new section header
      if (question.sectionTitle !== currentSection) {
        checkNewPage(25);
        currentSection = question.sectionTitle;
        
        // Section header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(245, 245, 245);
        doc.rect(margin, yPosition - 5, contentWidth, 10, 'F');
        doc.text(currentSection.toUpperCase(), margin + 5, yPosition + 2);
        yPosition += 15;
        questionNumber = 1;
      }

      // Question
      checkNewPage(40);
      
      // Question number and priority indicator
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const priorityIndicator = question.priority === 'high' ? '★' : question.priority === 'medium' ? '●' : '○';
      doc.text(`Q${questionNumber}. ${priorityIndicator}`, margin, yPosition);
      
      // Question text
      doc.setFont('helvetica', 'normal');
      yPosition = addWrappedText(question.question, margin + 15, yPosition, contentWidth - 15, 11);
      yPosition += 3;

      // Metadata line
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      let metaText = `[${question.category.replace('_', ' ').toUpperCase()}]`;
      if (question.documentReference) {
        metaText += ` | Doc: ${question.documentReference}`;
      }
      if (question.pageReference) {
        metaText += ` | Page: ${question.pageReference}`;
      }
      if (question.exhibitToShow) {
        metaText += ` | Show Exhibit: ${question.exhibitToShow}`;
      }
      doc.text(metaText, margin + 15, yPosition);
      doc.setTextColor(0, 0, 0);
      yPosition += 5;

      // Follow-up questions
      if (question.followUpQuestions && question.followUpQuestions.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text('Follow-ups:', margin + 15, yPosition);
        yPosition += 4;
        question.followUpQuestions.forEach((fq, i) => {
          checkNewPage(10);
          yPosition = addWrappedText(`→ ${fq}`, margin + 20, yPosition, contentWidth - 25, 9);
          yPosition += 2;
        });
        doc.setTextColor(0, 0, 0);
      }

      yPosition += 8;
      questionNumber++;
    });

    // Add footer with page numbers
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${totalPages} | ${session.caseName} - Deposition of ${session.deponentName}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }

    // Save the PDF
    const fileName = `Deposition_Outline_${session.deponentName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  }, [session]);

  // Error banner component
  const ErrorBanner = () => {
    if (!error) return null;
    return (
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800 text-sm">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  // Render setup step
  const renderSetup = () => (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 mb-4">
          <Users className="w-8 h-8 text-orange-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Deposition Prep Tool</h1>
        <p className="text-gray-600">
          Analyze case documents and generate strategic deposition questions
        </p>
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <h2 className="text-xl font-semibold mb-6">Start a New Deposition Prep</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deponent Name
            </label>
            <input
              type="text"
              value={deponentName}
              onChange={(e) => setDeponentName(e.target.value)}
              placeholder="e.g., John Smith (Plaintiff)"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Case Name
            </label>
            <input
              type="text"
              value={caseName}
              onChange={(e) => setCaseName(e.target.value)}
              placeholder="e.g., Smith v. ABC Corporation"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Case Number <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={caseNumber}
              onChange={(e) => setCaseNumber(e.target.value)}
              placeholder="e.g., 2024-CV-12345"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition"
            />
          </div>
          
          <button
            onClick={createSession}
            disabled={!deponentName.trim() || !caseName.trim() || isCreatingSession}
            className="w-full py-3 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Session...
              </>
            ) : (
              <>
                Start Deposition Prep
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <Upload className="w-6 h-6 text-orange-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Upload case files</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <Search className="w-6 h-6 text-orange-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">AI analysis</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <MessageSquare className="w-6 h-6 text-orange-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Generate questions</p>
        </div>
      </div>
    </div>
  );

  // Render loading screen for question generation
  const renderGeneratingQuestions = () => (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <div className="text-center">
          <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full bg-orange-100 animate-pulse"></div>
            <Search className="w-12 h-12 text-orange-600 relative z-10 animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Documents</h2>
          <p className="text-gray-600 mb-6">
            Our AI is analyzing your case documents and generating strategic questions...
          </p>
          
          <div className="space-y-3 text-left max-w-md mx-auto mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-gray-700">Documents uploaded ({session?.documents.length} files)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
              </div>
              <span className="text-gray-700">Identifying gaps and contradictions...</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
              </div>
              <span className="text-gray-400">Generating strategic questions</span>
            </div>
          </div>
          
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-orange-600 rounded-full animate-loading-bar"></div>
          </div>
          
          <p className="text-sm text-gray-500 mt-4">
            This typically takes 30-60 seconds depending on document complexity
          </p>
        </div>
      </div>
      
      <div className="mt-6 bg-orange-50 rounded-lg p-4 border border-orange-200">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-900">While you wait...</p>
            <p className="text-sm text-orange-800 mt-1">
              The AI is identifying testimony gaps, detecting contradictions across documents,
              building a timeline of events, and generating strategic questions organized by topic.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Render documents step
  const renderDocuments = () => {
    if (isGeneratingQuestions) {
      return renderGeneratingQuestions();
    }
    
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Upload Case Materials</h1>
            <p className="text-gray-600">
              {session?.caseName} • Deponent: {session?.deponentName}
            </p>
          </div>
          <button
            onClick={generateQuestions}
            disabled={!session?.documents.length || isGeneratingQuestions}
            className="py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
          >
            <Zap className="w-5 h-5" />
            Generate Questions
          </button>
        </div>
        
        {/* Upload area */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-orange-500 transition cursor-pointer bg-gray-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => document.getElementById('deposition-file-input')?.click()}
        >
          <input
            id="deposition-file-input"
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
          
          {isUploadingDocument ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 text-orange-600 animate-spin mb-4" />
              <p className="text-gray-600">Uploading document...</p>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-1">
                Drop files here or click to upload
              </p>
              <p className="text-sm text-gray-500">
                Prior testimony, exhibits, transcripts, and case files
              </p>
            </>
          )}
        </div>
        
        {/* Document list */}
        {session?.documents && session.documents.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Uploaded Documents ({session.documents.length})</h3>
            <div className="space-y-2">
              {session.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="font-medium text-gray-900">{doc.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDocTypeBadgeClass(doc.type)}`}>
                          {doc.type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-500">
                          {(doc.size / 1024).toFixed(1)} KB
                        </span>
                        {doc.metadata?.witness && (
                          <span className="text-xs text-gray-500">
                            • Witness: {doc.metadata.witness}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    doc.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {doc.status === 'ready' ? 'Ready' : 'Processing'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Tips */}
        <div className="mt-6 bg-orange-50 rounded-lg p-4 border border-orange-200">
          <div className="flex gap-3">
            <Lightbulb className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-orange-900">Tips for better analysis</p>
              <ul className="text-sm text-orange-800 mt-1 space-y-1">
                <li>• Upload <strong>prior testimony</strong> to identify contradictions</li>
                <li>• Include <strong>exhibits</strong> you plan to use during the deposition</li>
                <li>• Add <strong>transcripts</strong> from other depositions in the case</li>
                <li>• Use <strong>text files (.txt)</strong> for best content extraction</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render analysis step
  const renderAnalysis = () => (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analysis Results</h1>
          <p className="text-gray-600">
            Found {session?.gaps.length || 0} gaps, {session?.contradictions.length || 0} contradictions, {session?.questions.length || 0} questions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentStep('questions')}
            className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition flex items-center gap-2"
          >
            <MessageSquare className="w-5 h-5" />
            View Questions
          </button>
          <button
            onClick={autoOrganizeOutline}
            disabled={isOrganizingOutline}
            className="py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 transition flex items-center gap-2"
          >
            {isOrganizingOutline ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <List className="w-5 h-5" />
            )}
            Build Outline
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Key Themes */}
        {session?.analysis?.keyThemes && session.analysis.keyThemes.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-orange-600" />
              Key Themes
            </h3>
            <div className="flex flex-wrap gap-2">
              {session.analysis.keyThemes.map((theme, index) => (
                <span key={index} className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}
        
        {/* Key Exhibits */}
        {session?.analysis?.keyExhibits && session.analysis.keyExhibits.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-orange-600" />
              Key Exhibits
            </h3>
            <div className="space-y-2">
              {session.analysis.keyExhibits.map((exhibit, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </span>
                  <span className="text-gray-700">{exhibit}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Testimony Gaps */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-purple-600" />
            Testimony Gaps ({session?.gaps.length || 0})
          </h3>
          {session?.gaps && session.gaps.length > 0 ? (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {session.gaps.map((gap) => (
                <div key={gap.id} className="border-l-4 border-purple-400 pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <p className="text-gray-900 font-medium">{gap.description}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadgeClass(gap.severity)}`}>
                      {gap.severity}
                    </span>
                  </div>
                  {gap.documentReferences.length > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      References: {gap.documentReferences.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No significant gaps identified</p>
          )}
        </div>
        
        {/* Contradictions */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            Contradictions ({session?.contradictions.length || 0})
          </h3>
          {session?.contradictions && session.contradictions.length > 0 ? (
            <div className="space-y-4 max-h-80 overflow-y-auto">
              {session.contradictions.map((contradiction) => (
                <div key={contradiction.id} className="border-l-4 border-red-400 pl-4 py-2">
                  <div className="flex items-start justify-between">
                    <p className="text-gray-900 font-medium">{contradiction.description}</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityBadgeClass(contradiction.severity)}`}>
                      {contradiction.severity}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600 space-y-1">
                    <p><strong>Source 1:</strong> {contradiction.source1.document} - &quot;{contradiction.source1.excerpt}&quot;</p>
                    <p><strong>Source 2:</strong> {contradiction.source2.document} - &quot;{contradiction.source2.excerpt}&quot;</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No contradictions detected</p>
          )}
        </div>
      </div>
      
      {/* Timeline Events */}
      {session?.analysis?.timelineEvents && session.analysis.timelineEvents.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            Timeline of Events
          </h3>
          <div className="space-y-3">
            {session.analysis.timelineEvents.map((event, index) => (
              <div key={index} className="flex items-start gap-4">
                <div className="flex-shrink-0 w-24 text-sm font-medium text-blue-600">
                  {event.date}
                </div>
                <div className="flex-1">
                  <p className="text-gray-900">{event.event}</p>
                  <p className="text-xs text-gray-500">Source: {event.source}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // Render questions step
  const renderQuestions = () => (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deposition Questions</h1>
          <p className="text-gray-600">
            {filteredQuestions.length} of {session?.questions.length} questions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentStep('analysis')}
            className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition flex items-center gap-2"
          >
            <Search className="w-5 h-5" />
            View Analysis
          </button>
          <button
            onClick={autoOrganizeOutline}
            disabled={isOrganizingOutline}
            className="py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 transition flex items-center gap-2"
          >
            {isOrganizingOutline ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <List className="w-5 h-5" />
            )}
            Build Outline
          </button>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Topic</label>
          <select
            value={selectedTopic || ''}
            onChange={(e) => setSelectedTopic(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">All Topics</option>
            {uniqueTopics.map((topic) => (
              <option key={topic} value={topic}>{topic}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by Priority</label>
          <select
            value={selectedPriority || ''}
            onChange={(e) => setSelectedPriority(e.target.value || null)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          >
            <option value="">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      
      {/* Questions list */}
      <div className="space-y-3">
        {filteredQuestions.map((question, index) => (
          <div
            key={question.id}
            className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition"
          >
            <div 
              className="p-4 cursor-pointer"
              onClick={() => toggleQuestionExpansion(question.id)}
            >
              <div className="flex items-start gap-4">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-medium text-orange-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-gray-900 font-medium mb-2">{question.question}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {question.topic}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBadgeClass(question.category)}`}>
                      {question.category.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadgeClass(question.priority)}`}>
                      {question.priority}
                    </span>
                    {question.documentReference && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <FileText className="w-3 h-3" />
                        {question.documentReference}
                      </span>
                    )}
                    {question.exhibitToShow && (
                      <span className="flex items-center gap-1 text-xs text-purple-600">
                        <Target className="w-3 h-3" />
                        Show: {question.exhibitToShow}
                      </span>
                    )}
                  </div>
                </div>
                <button className="p-1 text-gray-400 hover:text-gray-600">
                  {expandedQuestions.has(question.id) ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
            
            {expandedQuestions.has(question.id) && (
              <div className="px-4 pb-4 pt-0 border-t border-gray-100 bg-gray-50">
                {question.rationale && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Rationale</p>
                    <p className="text-sm text-gray-700">{question.rationale}</p>
                  </div>
                )}
                {question.followUpQuestions && question.followUpQuestions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Follow-up Questions</p>
                    <ul className="text-sm text-gray-700 space-y-1">
                      {question.followUpQuestions.map((fq, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-orange-500">→</span>
                          {fq}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {question.pageReference && (
                  <div className="mt-3">
                    <p className="text-xs text-gray-500">
                      Page Reference: {question.pageReference}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  // Render outline step
  const renderOutline = () => (
    <div className="max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Deposition Outline</h1>
          <p className="text-gray-600">
            {session?.outline?.sections.length || 0} sections • {session?.questions.length || 0} questions
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCurrentStep('questions')}
            className="py-2 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition flex items-center gap-2"
          >
            <MessageSquare className="w-5 h-5" />
            View All Questions
          </button>
          <button
            className="py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition flex items-center gap-2"
            onClick={exportToPDF}
          >
            <Download className="w-5 h-5" />
            Export to PDF
          </button>
        </div>
      </div>
      
      {/* Outline sections */}
      {session?.outline?.sections && session.outline.sections.length > 0 ? (
        <div className="space-y-4">
          {session.outline.sections.map((section, sectionIndex) => (
            <div key={section.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-sm font-bold text-orange-600">
                      {sectionIndex + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{section.title}</h3>
                      <p className="text-sm text-gray-500">
                        {section.questions.length} questions
                        {section.estimatedTime && ` • ~${section.estimatedTime} min`}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {section.questions.map((question, qIndex) => (
                  <div key={question.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
                        {qIndex + 1}
                      </span>
                      <div className="flex-1">
                        <p className="text-gray-900">{question.question}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBadgeClass(question.category)}`}>
                            {question.category.replace('_', ' ')}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadgeClass(question.priority)}`}>
                            {question.priority}
                          </span>
                          {question.documentReference && (
                            <span className="text-xs text-blue-600">
                              📄 {question.documentReference}
                            </span>
                          )}
                          {question.exhibitToShow && (
                            <span className="text-xs text-purple-600">
                              🎯 Show: {question.exhibitToShow}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <List className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No outline created yet</p>
          <button
            onClick={autoOrganizeOutline}
            disabled={isOrganizingOutline}
            className="py-2 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-300 transition"
          >
            {isOrganizingOutline ? 'Organizing...' : 'Auto-Organize Questions'}
          </button>
        </div>
      )}
      
      {/* Export tip */}
      <div className="mt-6 bg-orange-50 rounded-lg p-4 border border-orange-200">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-orange-900">Ready for the deposition?</p>
            <p className="text-sm text-orange-800 mt-1">
              Export your outline to PDF with document citations. Each question will include
              references to the source documents, priority indicators, and follow-up questions for easy reference during the deposition.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="py-8 px-4">
      {/* Error Banner */}
      <ErrorBanner />
      
      {/* Navigation */}
      {session && currentStep !== 'setup' && (
        <nav className="max-w-6xl mx-auto mb-6">
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-orange-600" />
              <span className="font-medium text-gray-900">{session.caseName}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{session.deponentName}</span>
            </div>
            <div className="flex items-center gap-6">
              {['documents', 'analysis', 'questions', 'outline'].map((step, index) => {
                const steps: AppStep[] = ['documents', 'analysis', 'questions', 'outline'];
                const currentIndex = steps.indexOf(currentStep);
                const stepIndex = index;
                const isActive = currentStep === step;
                const isCompleted = stepIndex < currentIndex;
                const isAccessible = stepIndex <= currentIndex || (step === 'questions' && session.questions.length > 0) || (step === 'outline' && session.outline);
                
                return (
                  <button
                    key={step}
                    onClick={() => {
                      if (isAccessible) {
                        setCurrentStep(step as AppStep);
                      }
                    }}
                    disabled={!isAccessible}
                    className={`flex items-center gap-2 text-sm font-medium transition ${
                      isActive 
                        ? 'text-orange-600' 
                        : isCompleted || isAccessible
                          ? 'text-gray-600 hover:text-gray-900 cursor-pointer' 
                          : 'text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      isActive 
                        ? 'bg-orange-600 text-white' 
                        : isCompleted 
                          ? 'bg-green-100 text-green-600' 
                          : 'bg-gray-200 text-gray-500'
                    }`}>
                      {isCompleted ? <CheckCircle className="w-4 h-4" /> : index + 1}
                    </span>
                    <span className="capitalize hidden sm:inline">{step}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                if (confirm('Are you sure you want to end this session?')) {
                  resetToSetup();
                }
              }}
              className="p-2 text-gray-400 hover:text-gray-600 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </nav>
      )}
      
      {/* Main content */}
      {currentStep === 'setup' && renderSetup()}
      {currentStep === 'documents' && renderDocuments()}
      {currentStep === 'analysis' && renderAnalysis()}
      {currentStep === 'questions' && renderQuestions()}
      {currentStep === 'outline' && renderOutline()}
    </div>
  );
}
