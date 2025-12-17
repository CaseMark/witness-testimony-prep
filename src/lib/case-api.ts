// Case.dev API client for Testimony Prep Tool

const CASE_API_BASE = 'https://api.case.dev';

// Get API key from environment
function getApiKey(): string {
  const apiKey = process.env.CASEDEV_API_KEY;
  if (!apiKey) {
    throw new Error('CASEDEV_API_KEY environment variable is not set');
  }
  return apiKey;
}

// Vault API - Document Storage
export async function createVault(name: string, description?: string) {
  const response = await fetch(`${CASE_API_BASE}/vault`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, description }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create vault: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getUploadUrl(vaultId: string, filename: string, contentType: string, metadata?: Record<string, unknown>) {
  const response = await fetch(`${CASE_API_BASE}/vault/${vaultId}/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filename,
      contentType,
      metadata,
      auto_index: true,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get upload URL: ${response.statusText}`);
  }
  
  return response.json();
}

export async function uploadToS3(uploadUrl: string, file: ArrayBuffer | Blob, contentType: string) {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: file,
  });
  
  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }
  
  return true;
}

export async function searchVault(vaultId: string, query: string, limit = 10) {
  const response = await fetch(`${CASE_API_BASE}/vault/${vaultId}/search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, limit }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to search vault: ${response.statusText}`);
  }
  
  return response.json();
}

// LLM API - Question Generation and AI Examiner
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  } = {}
): Promise<ChatCompletionResponse> {
  const response = await fetch(`${CASE_API_BASE}/llm/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'anthropic/claude-sonnet-4-20250514',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: options.stream ?? false,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM API error: ${error}`);
  }
  
  return response.json();
}

// Streaming chat completion
export async function* streamChatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
  } = {}
): AsyncGenerator<string> {
  const response = await fetch(`${CASE_API_BASE}/llm/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'anthropic/claude-sonnet-4-20250514',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 4096,
      stream: true,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`LLM API error: ${response.statusText}`);
  }
  
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
    
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

// Voice API - Transcription
export async function createTranscription(
  audioUrl: string,
  options: {
    language_code?: string;
    speaker_labels?: boolean;
    webhook_url?: string;
    word_boost?: string[];
  } = {}
) {
  const response = await fetch(`${CASE_API_BASE}/voice/transcription`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: options.language_code || 'en',
      speaker_labels: options.speaker_labels ?? true,
      webhook_url: options.webhook_url,
      word_boost: options.word_boost || ['objection', 'sustained', 'overruled', 'witness', 'testimony'],
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Transcription API error: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getTranscriptionStatus(transcriptionId: string) {
  const response = await fetch(`${CASE_API_BASE}/voice/transcription/${transcriptionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getApiKey()}`,
    },
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get transcription status: ${response.statusText}`);
  }
  
  return response.json();
}
