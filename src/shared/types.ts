export type PanelId = 'assistant' | 'transcript' | 'translation' | 'teleprompter' | 'notes' | 'settings';

export interface AppSettings {
  claudeCliPath: string;
  claudeModel: string;
  whisperBinaryPath: string;
  whisperModelPath: string;
  whisperLanguage: 'auto' | 'pt' | 'en';
  translationEnabled: boolean;
  translationTargetPair: 'pt-en';
  keepAudioChunks: boolean;
  dataDir: string;
  setupCompleted: boolean;
  hotkeys: {
    toggleOverlay: string;
    toggleClickThrough: string;
    askClaude: string;
    screenshotAsk: string;
    toggleTranscription: string;
    toggleTeleprompter: string;
    toggleTranslation: string;
  };
}

export type SpeakerTag = 'you' | 'others';

export interface TranscriptLine {
  id: string;
  timestamp: number;
  speaker: SpeakerTag;
  language: 'pt' | 'en' | 'unknown';
  text: string;
  translation?: string;
}

export interface AssistantMessage {
  id: string;
  timestamp: number;
  kind: 'question' | 'screenshot' | 'answer' | 'error';
  text: string;
  imagePath?: string;
}

export interface MeetingSession {
  id: string;
  startedAt: number;
  title: string;
  transcript: TranscriptLine[];
  notes: string;
  assistantLog: AssistantMessage[];
}

export interface TeleprompterScript {
  title: string;
  content: string;
}
