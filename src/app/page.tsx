'use client';

import { useState } from 'react';
import { Scale, Users } from 'lucide-react';
import TestimonyPrepTool from '@/components/TestimonyPrepTool';
import DepositionPrepTool from '@/components/DepositionPrepTool';

type ToolMode = 'testimony' | 'deposition';

export default function HybridWitnessPrepPage() {
  const [activeMode, setActiveMode] = useState<ToolMode>('testimony');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tool Toggle Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <Scale className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900">Witness Prep Suite</h1>
                <p className="text-xs text-gray-500">Powered by Case.dev</p>
              </div>
            </div>
            
            {/* Toggle Switch */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveMode('testimony')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeMode === 'testimony'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Scale className="w-4 h-4" />
                <span className="hidden sm:inline">Testimony Prep</span>
                <span className="sm:hidden">Testimony</span>
              </button>
              <button
                onClick={() => setActiveMode('deposition')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeMode === 'deposition'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Deposition Prep</span>
                <span className="sm:hidden">Deposition</span>
              </button>
            </div>
          </div>
          
          {/* Mode Description */}
          <div className="mt-2 text-center">
            {activeMode === 'testimony' ? (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-blue-600">For Defense Counsel:</span> Prepare your witness for cross-examination with AI-generated questions and practice sessions
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-orange-600">For Opposing Counsel:</span> Analyze case documents and generate strategic deposition questions
              </p>
            )}
          </div>
        </div>
      </div>
      
      {/* Tool Content */}
      <div className="transition-opacity duration-300">
        {activeMode === 'testimony' ? (
          <TestimonyPrepTool />
        ) : (
          <DepositionPrepTool />
        )}
      </div>
    </div>
  );
}
