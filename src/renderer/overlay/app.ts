import type { MeetingCopilotApi } from '../../preload/preload';
import type { AppSettings, AssistantMessage, OverlayPositionPreset, PanelVisibility, TranscriptLine, WhisperLang } from '../../shared/types';

declare global {
  interface Window {
    meetingCopilot: MeetingCopilotApi;
  }
}

const api = window.meetingCopilot;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

// ---------- Tabs ----------
let applyPanelVisibility: (panels: PanelVisibility) => void = () => undefined;

function initTabs(): void {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));

  function activate(panelId: string) {
    for (const tab of tabs) tab.classList.toggle('active', tab.dataset.panel === panelId);
    for (const panel of panels) panel.classList.toggle('active', panel.dataset.panel === panelId);
  }

  for (const tab of tabs) {
    tab.addEventListener('click', () => activate(tab.dataset.panel as string));
  }

  api.overlay.onShowPanel((panelId) => activate(panelId));

  applyPanelVisibility = (panelVisibility) => {
    for (const tab of tabs) {
      const id = tab.dataset.panel as keyof PanelVisibility | 'settings';
      if (id === 'settings') continue; // always reachable, so the user can turn panels back on
      tab.hidden = !panelVisibility[id];
    }
    const activeTab = tabs.find((t) => t.classList.contains('active'));
    if (activeTab?.hidden) {
      const fallback = tabs.find((t) => !t.hidden) ?? tabs.find((t) => t.dataset.panel === 'settings');
      if (fallback) activate(fallback.dataset.panel as string);
    }
  };

  api.settings.get().then((settings) => applyPanelVisibility(settings.panels));
}

// ---------- Titlebar ----------
function initTitlebar(): void {
  $('btnHide').addEventListener('click', () => api.overlay.hide());
  $('btnClickThrough').addEventListener('click', () => api.overlay.toggleClickThrough());
  api.overlay.onClickThroughChanged((enabled) => {
    $('statusDot').style.background = enabled ? '#ffd27c' : '';
  });
}

// ---------- Assistant ----------
function appendAssistantMessage(msg: AssistantMessage): void {
  const log = $('assistantLog');
  const div = document.createElement('div');
  div.className = `msg ${msg.kind}`;
  const prefix = { question: 'Você', screenshot: 'Print', answer: 'Claude', error: 'Erro' }[msg.kind];
  div.textContent = `${prefix}: ${msg.text}`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function initAssistant(): void {
  const input = $<HTMLInputElement>('assistantInput');

  async function ask() {
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    appendAssistantMessage({ id: 'local', timestamp: Date.now(), kind: 'question', text: question });
    const answer = await api.assistant.ask(question);
    appendAssistantMessage(answer);
  }

  async function screenshotAsk() {
    const question = input.value.trim();
    input.value = '';
    appendAssistantMessage({
      id: 'local',
      timestamp: Date.now(),
      kind: 'screenshot',
      text: question || '(print da tela)',
    });
    const answer = await api.assistant.screenshotAsk(question);
    appendAssistantMessage(answer);
  }

  $('btnAsk').addEventListener('click', ask);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ask();
  });
  $('btnScreenshot').addEventListener('click', screenshotAsk);

  api.overlay.onShortcutAskClaude(() => {
    api.overlay.showPanel('assistant');
    input.focus();
  });
  api.overlay.onShortcutScreenshotAsk(() => {
    api.overlay.showPanel('assistant');
    screenshotAsk();
  });
}

// ---------- Transcript / Translation ----------
const transcriptElements = new Map<string, HTMLElement>();

function renderTranscriptLine(line: TranscriptLine, container: HTMLElement, withTranslation: boolean): HTMLElement {
  const div = document.createElement('div');
  div.className = `transcript-line ${line.speaker}`;
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${line.speaker === 'you' ? 'Você' : 'Outros'} · ${new Date(line.timestamp).toLocaleTimeString('pt-BR')}`;
  const text = document.createElement('div');
  text.textContent = line.text;
  div.appendChild(meta);
  div.appendChild(text);
  if (withTranslation && line.translation) {
    const tr = document.createElement('div');
    tr.className = 'translation';
    tr.textContent = line.translation;
    div.appendChild(tr);
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function initTranscription(): void {
  const toggle = $<HTMLInputElement>('toggleTranscription');
  const transcriptLog = $('transcriptLog');
  const translationLog = $('translationLog');

  api.transcription.getState().then((enabled) => (toggle.checked = enabled));

  toggle.addEventListener('change', () => api.transcription.setEnabled(toggle.checked));
  api.overlay.onShortcutToggleTranscription(() => {
    toggle.checked = !toggle.checked;
    api.transcription.setEnabled(toggle.checked);
    api.overlay.showPanel('transcript');
  });

  api.transcription.onLine((line) => {
    const el = renderTranscriptLine(line, transcriptLog, false);
    transcriptElements.set(line.id, el);
  });

  api.translation.onUpdate((line) => {
    if (!line.translation) return;
    renderTranscriptLine(line, translationLog, true);
    const existing = transcriptElements.get(line.id);
    if (existing && !existing.querySelector('.translation')) {
      const tr = document.createElement('div');
      tr.className = 'translation';
      tr.textContent = line.translation;
      existing.appendChild(tr);
    }
  });

  const toggleTranslation = $<HTMLInputElement>('toggleTranslation');
  toggleTranslation.addEventListener('change', () => api.translation.setEnabled(toggleTranslation.checked));
  api.overlay.onShortcutToggleTranslation(() => {
    toggleTranslation.checked = !toggleTranslation.checked;
    api.translation.setEnabled(toggleTranslation.checked);
    api.overlay.showPanel('translation');
  });
}

// ---------- Teleprompter ----------
function initTeleprompter(): void {
  const titleInput = $<HTMLInputElement>('teleprompterTitle');
  const edit = $<HTMLTextAreaElement>('teleprompterEdit');
  const view = $('teleprompterView');
  const playBtn = $<HTMLButtonElement>('btnTeleprompterPlay');
  const speed = $<HTMLInputElement>('teleprompterSpeed');

  let scrolling = false;
  let rafId = 0;

  api.teleprompter.get().then((script) => {
    titleInput.value = script.title;
    edit.value = script.content;
  });

  function save() {
    api.teleprompter.set({ title: titleInput.value, content: edit.value });
  }
  titleInput.addEventListener('change', save);
  edit.addEventListener('change', save);

  function tick() {
    if (!scrolling) return;
    view.scrollTop += Number(speed.value) / 50;
    rafId = requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    scrolling = !scrolling;
    if (scrolling) {
      view.textContent = edit.value;
      view.hidden = false;
      edit.hidden = true;
      playBtn.textContent = '⏸ Pausar';
      rafId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafId);
      view.hidden = true;
      edit.hidden = false;
      playBtn.textContent = '▶ Rolar';
    }
  });
}

// ---------- Notes ----------
function initNotes(): void {
  const notes = $<HTMLTextAreaElement>('notesEdit');

  api.session.getActive().then((session) => {
    notes.value = session.notes;
  });

  let saveTimer = 0;
  notes.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => api.session.updateNotes(notes.value), 500);
  });

  $('btnNewMeeting').addEventListener('click', async () => {
    if (!confirm('Iniciar uma nova reunião? A anterior fica salva em disco.')) return;
    const session = await api.session.newMeeting();
    notes.value = session.notes;
    $('assistantLog').innerHTML = '';
    $('transcriptLog').innerHTML = '';
    $('translationLog').innerHTML = '';
  });

  $('btnExport').addEventListener('click', async () => {
    const markdown = await api.session.exportMarkdown();
    await navigator.clipboard.writeText(markdown);
    alert('Markdown da reunião copiado para a área de transferência.');
  });
}

// ---------- Settings ----------
function applyGlassOpacity(opacity: number): void {
  document.documentElement.style.setProperty('--glass-bg', `rgba(22, 24, 32, ${opacity})`);
  document.documentElement.style.setProperty('--glass-bg-strong', `rgba(22, 24, 32, ${Math.min(1, opacity + 0.2)})`);
}

function initSettings(): void {
  const fields: Record<keyof Pick<AppSettings, 'claudeCliPath' | 'claudeModel' | 'whisperBinaryPath' | 'whisperModelPath' | 'dataDir'>, HTMLInputElement> = {
    claudeCliPath: $('cfgClaudeCli'),
    claudeModel: $('cfgClaudeModel'),
    whisperBinaryPath: $('cfgWhisperBin'),
    whisperModelPath: $('cfgWhisperModel'),
    dataDir: $('cfgDataDir'),
  };
  const langYou = $<HTMLSelectElement>('cfgWhisperLangYou');
  const langOthers = $<HTMLSelectElement>('cfgWhisperLangOthers');
  const keepAudio = $<HTMLInputElement>('cfgKeepAudio');
  const position = $<HTMLSelectElement>('cfgOverlayPosition');
  const opacity = $<HTMLInputElement>('cfgGlassOpacity');
  const panelToggles: Record<keyof PanelVisibility, HTMLInputElement> = {
    assistant: $('cfgPanelAssistant'),
    transcript: $('cfgPanelTranscript'),
    translation: $('cfgPanelTranslation'),
    teleprompter: $('cfgPanelTeleprompter'),
    notes: $('cfgPanelNotes'),
  };

  api.settings.get().then((settings) => {
    fields.claudeCliPath.value = settings.claudeCliPath;
    fields.claudeModel.value = settings.claudeModel;
    fields.whisperBinaryPath.value = settings.whisperBinaryPath;
    fields.whisperModelPath.value = settings.whisperModelPath;
    fields.dataDir.value = settings.dataDir;
    langYou.value = settings.whisperLanguageYou;
    langOthers.value = settings.whisperLanguageOthers;
    keepAudio.checked = settings.keepAudioChunks;
    position.value = settings.overlayPositionPreset;
    opacity.value = String(Math.round(settings.glassOpacity * 100));
    applyGlassOpacity(settings.glassOpacity);
    for (const key of Object.keys(panelToggles) as Array<keyof PanelVisibility>) {
      panelToggles[key].checked = settings.panels[key];
    }
  });

  // Live preview while dragging the slider; the actual save happens on "Salvar".
  opacity.addEventListener('input', () => applyGlassOpacity(Number(opacity.value) / 100));

  position.addEventListener('change', () => {
    api.overlay.setPositionPreset(position.value as OverlayPositionPreset);
  });

  $('btnSaveSettings').addEventListener('click', async () => {
    const panels: PanelVisibility = {
      assistant: panelToggles.assistant.checked,
      transcript: panelToggles.transcript.checked,
      translation: panelToggles.translation.checked,
      teleprompter: panelToggles.teleprompter.checked,
      notes: panelToggles.notes.checked,
    };
    await api.settings.set({
      claudeCliPath: fields.claudeCliPath.value.trim() || 'claude',
      claudeModel: fields.claudeModel.value.trim(),
      whisperBinaryPath: fields.whisperBinaryPath.value.trim(),
      whisperModelPath: fields.whisperModelPath.value.trim(),
      dataDir: fields.dataDir.value.trim(),
      whisperLanguageYou: langYou.value as WhisperLang,
      whisperLanguageOthers: langOthers.value as WhisperLang,
      keepAudioChunks: keepAudio.checked,
      glassOpacity: Number(opacity.value) / 100,
      panels,
    });
    applyPanelVisibility(panels);
    alert('Configurações salvas.');
  });

  $('btnOpenSetupWizard').addEventListener('click', () => api.settings.openSetupWizard());
}

initTabs();
initTitlebar();
initAssistant();
initTranscription();
initTeleprompter();
initNotes();
initSettings();
