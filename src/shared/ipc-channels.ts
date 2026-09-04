// Central registry of IPC channel names shared between main, preload and renderer.
export const IPC = {
  // Overlay <-> main
  overlayToggle: 'overlay:toggle',
  clickThroughToggle: 'overlay:click-through-toggle',
  panelShow: 'overlay:panel-show',
  overlaySetPositionPreset: 'overlay:set-position-preset',

  // Popping a panel out of the main overlay into its own floating window
  panelPopOut: 'overlay:panel-pop-out', // renderer -> main
  panelDock: 'overlay:panel-dock', // renderer -> main
  panelPopStateChanged: 'overlay:panel-pop-state-changed', // main -> broadcast to all windows

  // Global-hotkey-triggered actions, forwarded from main to the overlay renderer
  shortcutAskClaude: 'shortcut:ask-claude',
  shortcutScreenshotAsk: 'shortcut:screenshot-ask',
  shortcutToggleTranscription: 'shortcut:toggle-transcription',
  shortcutToggleTranslation: 'shortcut:toggle-translation',

  // Assistant (Claude Code CLI)
  askClaude: 'assistant:ask',
  screenshotAsk: 'assistant:screenshot-ask',
  answerRecentQuestion: 'assistant:answer-recent-question',
  assistantEvent: 'assistant:event', // main -> renderer stream of AssistantMessage

  // Audio capture window <-> main
  audioChunk: 'audio:chunk', // renderer(hidden) -> main raw PCM chunk
  audioCaptureStart: 'audio:capture-start', // main -> hidden renderer
  audioCaptureStop: 'audio:capture-stop', // main -> hidden renderer
  audioFlushNow: 'audio:flush-now', // main -> hidden renderer, flush partial buffers early
  transcriptionEnable: 'audio:transcription-enable',
  transcriptionGetState: 'audio:transcription-get-state',
  transcriptEvent: 'audio:transcript-event', // main -> renderer
  audioCaptureError: 'audio:capture-error', // hidden renderer -> main
  audioHeartbeat: 'audio:heartbeat', // main -> renderer, proof-of-life per processed chunk
  diagnosticEvent: 'diagnostic:event', // main -> renderer, surfaced errors

  // Translation
  translationEnable: 'translation:enable',
  translationEvent: 'translation:event',

  // Teleprompter
  teleprompterGet: 'teleprompter:get',
  teleprompterSet: 'teleprompter:set',
  teleprompterEvent: 'teleprompter:event', // main -> broadcast, script changed elsewhere

  // Notes / session
  sessionGetActive: 'session:get-active',
  sessionUpdateNotes: 'session:update-notes',
  sessionNewMeeting: 'session:new-meeting',
  sessionExport: 'session:export',
  notesEvent: 'session:notes-event', // main -> broadcast, notes changed elsewhere
  sessionResetEvent: 'session:reset-event', // main -> broadcast, new meeting started

  // Settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',

  // Setup wizard
  setupOpenWindow: 'setup:open-window',
  setupCheckAll: 'setup:check-all',
  setupInstallClaudeCli: 'setup:install-claude-cli',
  setupOpenClaudeLogin: 'setup:open-claude-login',
  setupDownloadWhisperBinary: 'setup:download-whisper-binary',
  setupDownloadWhisperModel: 'setup:download-whisper-model',
  setupFinish: 'setup:finish',
  setupProgress: 'setup:progress', // main -> renderer
  setupLog: 'setup:log', // main -> renderer
} as const;
