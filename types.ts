export type Level = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Message {
  id: string;
  speaker: 'user' | 'emma';
  text?: string; // User's recognized speech
  speak?: string; // Emma's spoken text
  subtitle?: string; // Emma's clean subtitle
}

export type AppState = 'level-selection' | 'conversation';

export type EmmaState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface EmmaResponse {
    speak: string;
    subtitle: string;
}

// Fix for components/AssistantAvatar.tsx
export type AssistantState = 'idle' | 'listening' | 'thinking' | 'generating_audio' | 'speaking';

// Fix for components/ConversationDisplay.tsx
export interface Correction {
    original: string;
    corrected: string;
    responseToSpeak: string;
    explanation?: string;
}

// Fix for components/LearnedWords.tsx
export interface LearnedWord {
    word: string;
    meaning: string;
}

// FIX: Consolidate global declarations here to resolve conflicts.
export interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string;
  start: () => void; stop: () => void;
  onresult: (event: any) => void; onerror: (event: any) => void; onend: () => void;
}

// FIX: The AIStudio interface is defined here to avoid conflicts with other
// potential global declarations. By placing it inside `declare global`, it
// becomes a single, consolidated definition for the `window.aistudio` object.
export interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
}

declare global {
    // FIX: The AIStudio interface is defined here to avoid conflicts with other
    // potential global declarations. By placing it inside `declare global`, it
    // becomes a single, consolidated definition for the `window.aistudio` object.
    interface Window {
        aistudio: AIStudio;
        SpeechRecognition: { new(): SpeechRecognition; };
        webkitSpeechRecognition: { new(): SpeechRecognition; };
    }
}
