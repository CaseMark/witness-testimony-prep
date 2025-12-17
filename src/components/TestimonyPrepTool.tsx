'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  Scale, 
  Upload, 
  FileText, 
  MessageSquare, 
  Play, 
  Clock,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Mic,
  MicOff,
  X,
  Lightbulb,
  Target,
  Shield,
  AlertCircle
} from 'lucide-react';

interface Document {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  status: string;
  content?: string;
}

interface CrossExamQuestion {
  id: string;
  question: string;
  category: 'timeline' | 'credibility' | 'inconsistency' | 'foundation' | 'impeachment' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
  suggestedApproach?: string;
  weakPoint?: string;
  followUpQuestions?: string[];
  documentReference?: string;
}

interface PracticeExchange {
  id: string;
  questionId: string;
  question: string;
  witnessResponse: string;
  aiFollowUp?: string;
  feedback?: string;
  timestamp: string;
}

interface AIResponse {
  followUp?: string;
  feedback?: string;
  weaknessIdentified?: string;
  suggestedImprovement?: string;
}

interface Session {
  id: string;
  witnessName: string;
  caseName: string;
  createdAt: string;
  documents: Document[];
  questions: CrossExamQuestion[];
  status: string;
  practiceHistory: PracticeExchange[];
  totalDuration: number;
}

type AppStep = 'setup' | 'documents' | 'questions' | 'practice' | 'review';

export default function TestimonyPrepTool() {
  // Session state
  const [session, setSession] = useState<Session | null>(null);
  const [currentStep, setCurrentStep] = useState<AppStep>('setup');
  
  // Form state
  const [witnessName, setWitnessName] = useState('');
  const [caseName, setCaseName] = useState('');
  
  // Loading states
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);
  
  // Error state
  const [error, setError] = useState<string | null>(null);
  
  // Practice state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [witnessResponse, setWitnessResponse] = useState('');
  const [lastAIResponse, setLastAIResponse] = useState<AIResponse | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Timer state
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer effect - updates every second during practice mode
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (currentStep === 'practice' && sessionStartTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - sessionStartTime.getTime()) / 1000);
        setElapsedTime(elapsed);
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [currentStep, sessionStartTime]);

  // Clear error after timeout
  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 10000);
  };

  // Create a new session
  const createSession = async () => {
    if (!witnessName.trim() || !caseName.trim()) return;
    
    setIsCreatingSession(true);
    setError(null);
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ witnessName, caseName }),
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
    setWitnessName('');
    setCaseName('');
    setCurrentQuestionIndex(0);
    setWitnessResponse('');
    setLastAIResponse(null);
    setShowFeedback(false);
    setError(null);
  }, []);

  // Upload document
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || !session) return;
    
    setIsUploadingDocument(true);
    setError(null);
    
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch(`/api/sessions/${session.id}/documents`, {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        if (!response.ok) {
          // If session not found, reset to setup
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
      const response = await fetch(`/api/sessions/${session.id}/generate-questions`, {
        method: 'POST',
      });
      
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Failed to generate questions');
        return;
      }
      
      if (data.session) {
        setSession(data.session);
        setCurrentStep('questions');
      }
    } catch (err) {
      console.error('Error generating questions:', err);
      showError('Failed to generate questions. Please check your API key and try again.');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Start practice mode
  const startPractice = () => {
    setCurrentStep('practice');
    setCurrentQuestionIndex(0);
    setSessionStartTime(new Date());
    setQuestionStartTime(new Date());
    setError(null);
  };

  // Submit practice response
  const submitResponse = async () => {
    if (!session || !witnessResponse.trim()) return;
    
    const currentQuestion = session.questions[currentQuestionIndex];
    if (!currentQuestion) return;
    
    setIsSubmittingResponse(true);
    setShowFeedback(false);
    setError(null);
    
    const duration = questionStartTime 
      ? Math.floor((new Date().getTime() - questionStartTime.getTime()) / 1000)
      : 0;
    
    try {
      const response = await fetch(`/api/sessions/${session.id}/practice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          question: currentQuestion.question,
          response: witnessResponse,
          duration,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        showError(data.error || 'Failed to analyze response');
        setIsSubmittingResponse(false);
        return;
      }
      if (data.session) {
        setSession(data.session);
      }
      if (data.aiResponse) {
        setLastAIResponse(data.aiResponse);
        setShowFeedback(true);
      }
    } catch (err) {
      console.error('Error submitting response:', err);
      showError('Failed to analyze response. Please check your API key and try again.');
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Move to next question
  const nextQuestion = () => {
    if (!session) return;
    
    if (currentQuestionIndex < session.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setWitnessResponse('');
      setLastAIResponse(null);
      setShowFeedback(false);
      setQuestionStartTime(new Date());
    } else {
      setCurrentStep('review');
    }
  };

  // Toggle recording (placeholder for voice recording)
  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // In production, this would integrate with the Voice API
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get category badge class
  const getCategoryBadgeClass = (category: string) => {
    return `badge-${category}`;
  };

  // Get difficulty badge class
  const getDifficultyBadgeClass = (difficulty: string) => {
    return `difficulty-${difficulty}`;
  };

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
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
          <Scale className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Testimony Prep Tool</h1>
        <p className="text-gray-600">
          Prepare witnesses for cross-examination with AI-generated questions and practice sessions
        </p>
      </div>
      
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <h2 className="text-xl font-semibold mb-6">Start a New Session</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Witness Name
            </label>
            <input
              type="text"
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              placeholder="e.g., Dr. Sarah Johnson"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
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
              placeholder="e.g., Smith v. Memorial Hospital"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
            />
          </div>
          
          <button
            onClick={createSession}
            disabled={!witnessName.trim() || !caseName.trim() || isCreatingSession}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Session...
              </>
            ) : (
              <>
                Start Session
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </div>
      
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <Upload className="w-6 h-6 text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Upload case documents</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <MessageSquare className="w-6 h-6 text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Generate questions</p>
        </div>
        <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
          <Play className="w-6 h-6 text-blue-600 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Practice with AI</p>
        </div>
      </div>
    </div>
  );

  // Render loading screen for question generation
  const renderGeneratingQuestions = () => (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
        <div className="text-center">
          {/* Animated scales icon */}
          <div className="relative inline-flex items-center justify-center w-24 h-24 mb-6">
            <div className="absolute inset-0 rounded-full bg-blue-100 animate-pulse"></div>
            <Scale className="w-12 h-12 text-blue-600 relative z-10 animate-bounce" />
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Generating Cross-Examination Questions</h2>
          <p className="text-gray-600 mb-6">
            Our AI is analyzing your documents and crafting challenging questions...
          </p>
          
          {/* Progress steps */}
          <div className="space-y-3 text-left max-w-md mx-auto mb-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-600" />
              </div>
              <span className="text-gray-700">Documents uploaded ({session?.documents.length} files)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
              </div>
              <span className="text-gray-700">Analyzing document content...</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
              </div>
              <span className="text-gray-400">Generating questions</span>
            </div>
          </div>
          
          {/* Animated loading bar */}
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full animate-loading-bar"></div>
          </div>
          
          <p className="text-sm text-gray-500 mt-4">
            This typically takes 30-60 seconds depending on document complexity
          </p>
        </div>
      </div>
      
      {/* Tips while waiting */}
      <div className="mt-6 bg-amber-50 rounded-lg p-4 border border-amber-200">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">While you wait...</p>
            <p className="text-sm text-amber-800 mt-1">
              The AI is identifying potential weak points in the testimony, timeline inconsistencies, 
              and areas where opposing counsel might challenge credibility. It&apos;s also preparing 
              suggested response frameworks for each question.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  // Render documents step
  const renderDocuments = () => {
    // Show loading screen if generating questions
    if (isGeneratingQuestions) {
      return renderGeneratingQuestions();
    }
    
    return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Upload Case Materials</h1>
          <p className="text-gray-600">
            {session?.caseName} • Witness: {session?.witnessName}
          </p>
        </div>
        <button
          onClick={generateQuestions}
          disabled={!session?.documents.length || isGeneratingQuestions}
          className="py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          Generate Questions
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
      
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 transition cursor-pointer bg-gray-50"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleFileUpload(e.dataTransfer.files);
        }}
        onClick={() => document.getElementById('testimony-file-input')?.click()}
      >
        <input
          id="testimony-file-input"
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        
        {isUploadingDocument ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <p className="text-gray-600">Uploading document...</p>
          </div>
        ) : (
          <>
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-1">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500">
              Supports PDF, Word documents, and text files
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
                  <FileText className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">{doc.name}</p>
                    <p className="text-sm text-gray-500">
                      {(doc.size / 1024).toFixed(1)} KB
                    </p>
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
      <div className="mt-6 bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex gap-3">
          <Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">Tips for better questions</p>
            <ul className="text-sm text-blue-800 mt-1 space-y-1">
              <li>• Upload <strong>text files (.txt)</strong> for best results - content is extracted and analyzed</li>
              <li>• Include depositions, witness statements, and relevant exhibits</li>
              <li>• The AI will generate questions based on specific details in your documents</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    );
  };

  // Render questions step
  const renderQuestions = () => (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cross-Examination Questions</h1>
          <p className="text-gray-600">
            {session?.questions.length} questions generated for {session?.witnessName}
          </p>
        </div>
        <button
          onClick={startPractice}
          className="py-2 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Play className="w-5 h-5" />
          Start Practice
        </button>
      </div>
      
      {/* Question categories summary */}
      <div className="grid grid-cols-6 gap-2 mb-6">
        {['timeline', 'credibility', 'inconsistency', 'foundation', 'impeachment', 'general'].map((cat) => {
          const count = session?.questions.filter(q => q.category === cat).length || 0;
          return (
            <div key={cat} className={`px-3 py-2 rounded-lg text-center ${getCategoryBadgeClass(cat)}`}>
              <p className="text-xs font-medium capitalize">{cat}</p>
              <p className="text-lg font-bold">{count}</p>
            </div>
          );
        })}
      </div>
      
      {/* Questions list */}
      <div className="space-y-3">
        {session?.questions.map((question, index) => (
          <div
            key={question.id}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition"
          >
            <div className="flex items-start gap-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-medium text-gray-600">
                {index + 1}
              </span>
              <div className="flex-1">
                <p className="text-gray-900 font-medium mb-2">{question.question}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBadgeClass(question.category)}`}>
                    {question.category}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyBadgeClass(question.difficulty)}`}>
                    {question.difficulty}
                  </span>
                  {question.documentReference && (
                    <span className="flex items-center gap-1 text-xs text-blue-600">
                      <FileText className="w-3 h-3" />
                      {question.documentReference}
                    </span>
                  )}
                  {question.weakPoint && (
                    <span className="flex items-center gap-1 text-xs text-amber-600">
                      <AlertTriangle className="w-3 h-3" />
                      {question.weakPoint}
                    </span>
                  )}
                </div>
                {question.suggestedApproach && (
                  <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded p-2">
                    <strong>Suggested approach:</strong> {question.suggestedApproach}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Render practice step
  const renderPractice = () => {
    const currentQuestion = session?.questions[currentQuestionIndex];
    const progress = session ? ((currentQuestionIndex + 1) / session.questions.length) * 100 : 0;
    
    return (
      <div className="max-w-4xl mx-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Practice Mode</h1>
            <p className="text-gray-600">
              Question {currentQuestionIndex + 1} of {session?.questions.length}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-gray-600">
              <Clock className="w-5 h-5" />
              <span className="font-mono">{formatTime(elapsedTime)}</span>
            </div>
            <button
              onClick={toggleRecording}
              className={`p-2 rounded-full transition ${
                isRecording 
                  ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full mb-6">
          <div 
            className="h-full bg-blue-600 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        
        {/* Question card */}
        {currentQuestion && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            {/* Question header */}
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getCategoryBadgeClass(currentQuestion.category)}`}>
                  {currentQuestion.category}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDifficultyBadgeClass(currentQuestion.difficulty)}`}>
                  {currentQuestion.difficulty}
                </span>
                {currentQuestion.documentReference && (
                  <span className="flex items-center gap-1 text-xs text-blue-600">
                    <FileText className="w-3 h-3" />
                    {currentQuestion.documentReference}
                  </span>
                )}
              </div>
              <p className="text-lg font-medium text-gray-900">
                {currentQuestion.question}
              </p>
            </div>
            
            {/* Response area */}
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Response
              </label>
              <textarea
                value={witnessResponse}
                onChange={(e) => setWitnessResponse(e.target.value)}
                placeholder="Type your response as the witness would answer..."
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition resize-none"
                disabled={showFeedback}
              />
              
              {!showFeedback && (
                <div className="mt-4 flex gap-3">
                  <button
                    onClick={nextQuestion}
                    disabled={isSubmittingResponse}
                    className="py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:bg-gray-100 disabled:cursor-not-allowed transition"
                  >
                    Skip
                  </button>
                  <button
                    onClick={submitResponse}
                    disabled={!witnessResponse.trim() || isSubmittingResponse}
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {isSubmittingResponse ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Analyzing Response...
                      </>
                    ) : (
                      <>
                        Submit Response
                        <ChevronRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
            
            {/* AI Feedback */}
            {showFeedback && lastAIResponse && (
              <div className="border-t border-gray-200 p-6 bg-blue-50 animate-slide-up">
                <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-blue-600" />
                  AI Examiner Feedback
                </h3>
                
                {lastAIResponse.followUp && (
                  <div className="mb-4 p-4 bg-white rounded-lg border border-blue-200">
                    <p className="text-sm font-medium text-blue-800 mb-1">Follow-up Question:</p>
                    <p className="text-gray-900 italic">&ldquo;{lastAIResponse.followUp}&rdquo;</p>
                  </div>
                )}
                
                {lastAIResponse.feedback && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-1">Feedback:</p>
                    <p className="text-gray-600">{lastAIResponse.feedback}</p>
                  </div>
                )}
                
                {lastAIResponse.weaknessIdentified && (
                  <div className="mb-4 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Weakness Identified:</p>
                      <p className="text-gray-600">{lastAIResponse.weaknessIdentified}</p>
                    </div>
                  </div>
                )}
                
                {lastAIResponse.suggestedImprovement && (
                  <div className="mb-4 flex items-start gap-2">
                    <Shield className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Suggested Improvement:</p>
                      <p className="text-gray-600">{lastAIResponse.suggestedImprovement}</p>
                    </div>
                  </div>
                )}
                
                <button
                  onClick={nextQuestion}
                  className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
                >
                  {currentQuestionIndex < (session?.questions.length || 0) - 1 ? (
                    <>
                      Next Question
                      <ChevronRight className="w-5 h-5" />
                    </>
                  ) : (
                    <>
                      Complete Session
                      <CheckCircle className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Suggested approach hint */}
        {currentQuestion?.suggestedApproach && !showFeedback && (
          <div className="mt-4 bg-amber-50 rounded-lg p-4 border border-amber-200">
            <div className="flex gap-3">
              <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900">Suggested Approach</p>
                <p className="text-sm text-amber-800 mt-1">{currentQuestion.suggestedApproach}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render review step
  const renderReview = () => (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Session Complete!</h1>
        <p className="text-gray-600">
          Great work preparing {session?.witnessName} for cross-examination
        </p>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
          <p className="text-3xl font-bold text-blue-600">{session?.practiceHistory.length}</p>
          <p className="text-gray-600">Questions Practiced</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
          <p className="text-3xl font-bold text-blue-600">{formatTime(elapsedTime)}</p>
          <p className="text-gray-600">Total Time</p>
        </div>
        <div className="bg-white rounded-xl p-6 border border-gray-200 text-center">
          <p className="text-3xl font-bold text-blue-600">{session?.documents.length}</p>
          <p className="text-gray-600">Documents Reviewed</p>
        </div>
      </div>
      
      {/* Practice history */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold">Practice History</h2>
        </div>
        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {session?.practiceHistory.map((exchange, index) => (
            <div key={exchange.id} className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 mb-1">{exchange.question}</p>
                  <p className="text-sm text-gray-600 mb-2">
                    <strong>Response:</strong> {exchange.witnessResponse}
                  </p>
                  {exchange.feedback && (
                    <p className="text-sm text-blue-600 bg-blue-50 rounded p-2">
                      <strong>Feedback:</strong> {exchange.feedback}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <button
          onClick={() => {
            setSession(null);
            setCurrentStep('setup');
            setWitnessName('');
            setCaseName('');
            setCurrentQuestionIndex(0);
            setWitnessResponse('');
            setLastAIResponse(null);
            setShowFeedback(false);
          }}
          className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
        >
          Start New Session
        </button>
        <button
          onClick={() => {
            setCurrentStep('practice');
            setCurrentQuestionIndex(0);
            setWitnessResponse('');
            setLastAIResponse(null);
            setShowFeedback(false);
          }}
          className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Practice Again
        </button>
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
              <Scale className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-gray-900">{session.caseName}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-600">{session.witnessName}</span>
            </div>
            <div className="flex items-center gap-6">
              {['documents', 'questions', 'practice', 'review'].map((step, index) => {
                const steps: AppStep[] = ['documents', 'questions', 'practice', 'review'];
                const currentIndex = steps.indexOf(currentStep);
                const stepIndex = index;
                const isActive = currentStep === step;
                const isCompleted = stepIndex < currentIndex;
                
                return (
                  <button
                    key={step}
                    onClick={() => {
                      if (isCompleted || isActive) {
                        setCurrentStep(step as AppStep);
                      }
                    }}
                    disabled={!isCompleted && !isActive}
                    className={`flex items-center gap-2 text-sm font-medium transition ${
                      isActive 
                        ? 'text-blue-600' 
                        : isCompleted 
                          ? 'text-gray-600 hover:text-gray-900 cursor-pointer' 
                          : 'text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      isActive 
                        ? 'bg-blue-600 text-white' 
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
                  setSession(null);
                  setCurrentStep('setup');
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
      {currentStep === 'questions' && renderQuestions()}
      {currentStep === 'practice' && renderPractice()}
      {currentStep === 'review' && renderReview()}
    </div>
  );
}
