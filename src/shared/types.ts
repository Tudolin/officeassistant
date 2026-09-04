export type PanelId = 'assistant' | 'transcript' | 'translation' | 'teleprompter' | 'notes' | 'settings';

/** Every panel except 'settings' can be popped out into its own floating window. */
export type PoppablePanelId = Exclude<PanelId, 'settings'>;

export type WhisperLang = 'auto' | 'pt' | 'en';

export type OverlayPositionPreset = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'custom';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelVisibility {
  assistant: boolean;
  transcript: boolean;
  translation: boolean;
  teleprompter: boolean;
  notes: boolean;
}

/** Per-panel state for a panel that's been popped out of the main overlay into its own window. */
export interface PanelWindowState {
  popped: boolean;
  bounds: WindowBounds | null;
  positionPreset: OverlayPositionPreset;
}

export interface AppSettings {
  claudeCliPath: string;
  claudeModel: string;
  whisperBinaryPath: string;
  whisperModelPath: string;
  /** Transcription language for your own microphone audio. */
  whisperLanguageYou: WhisperLang;
  /** Transcription language for the other participants (system audio loopback). */
  whisperLanguageOthers: WhisperLang;
  translationEnabled: boolean;
  translationTargetPair: 'pt-en';
  keepAudioChunks: boolean;
  dataDir: string;
  setupCompleted: boolean;
  overlayBounds: WindowBounds | null;
  overlayPositionPreset: OverlayPositionPreset;
  glassOpacity: number;
  panels: PanelVisibility;
  poppedPanels: Partial<Record<PoppablePanelId, PanelWindowState>>;
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

export interface AudioHeartbeat {
  speaker: SpeakerTag;
  timestamp: number;
  hadSpeech: boolean;
}

export interface DiagnosticEvent {
  level: 'error' | 'info';
  message: string;
  timestamp: number;
}

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
