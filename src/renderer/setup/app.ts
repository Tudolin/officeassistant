import type { SetupApi, SetupProgress } from '../../preload/setupPreload';
import type { RequirementStatus } from '../../main/services/requirements';

declare global {
  interface Window {
    meetingCopilotSetup: SetupApi;
  }
}

const api = window.meetingCopilotSetup;

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const reqList = $('reqList');
const logBox = $<HTMLPreElement>('logBox');
const progressBlock = $('progressBlock');
const progressLabel = $('progressLabel');
const progressFill = $<HTMLDivElement>('progressFill');

function appendLog(line: string): void {
  logBox.hidden = false;
  logBox.textContent += line;
  logBox.scrollTop = logBox.scrollHeight;
}

function showProgress(label: string, received: number, total: number): void {
  progressBlock.hidden = false;
  const pct = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
  progressLabel.textContent = total > 0 ? `${label}: ${pct}% (${formatBytes(received)} / ${formatBytes(total)})` : `${label}: ${formatBytes(received)}`;
  progressFill.style.width = `${pct}%`;
}

function hideProgress(): void {
  progressBlock.hidden = true;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

api.onLog((line) => appendLog(line));
api.onProgress((progress: SetupProgress) => {
  const label = progress.item === 'whisper-binary' ? 'Baixando whisper.cpp' : 'Baixando modelo';
  showProgress(label, progress.received, progress.total);
});

function actionButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'secondary-btn';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

async function withBusyButton(btn: HTMLButtonElement, label: string, fn: () => Promise<void>): Promise<void> {
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
    hideProgress();
  }
}

function renderRequirement(req: RequirementStatus): HTMLElement {
  const card = document.createElement('div');
  card.className = 'req-card';

  const head = document.createElement('div');
  head.className = 'req-head';
  const icon = document.createElement('span');
  icon.className = `req-icon ${req.ok ? 'ok' : 'bad'}`;
  icon.textContent = req.ok ? '✓' : '✕';
  const title = document.createElement('span');
  title.className = 'req-title';
  title.textContent = req.label;
  head.appendChild(icon);
  head.appendChild(title);

  const detail = document.createElement('div');
  detail.className = 'req-detail';
  detail.textContent = req.detail;

  card.appendChild(head);
  card.appendChild(detail);

  if (!req.ok) {
    const actions = document.createElement('div');
    actions.className = 'req-actions';

    if (req.id === 'claude-cli') {
      const btn = actionButton('Instalar via npm', () => {
        withBusyButton(btn, 'Instalando...', async () => {
          logBox.textContent = '';
          const result = await api.installClaudeCli();
          if (!result.ok) appendLog(`\nErro: ${result.error}\n`);
          await refresh();
        });
      });
      actions.appendChild(btn);
    }

    if (req.id === 'claude-login') {
      actions.appendChild(
        actionButton('Fazer login (abre terminal)', async () => {
          await api.openClaudeLogin();
          alert('Complete o login na janela de terminal que abriu, depois clique em "Verificar novamente".');
        })
      );
    }

    if (req.id === 'whisper-binary') {
      const btn = actionButton('Baixar automaticamente', () => {
        withBusyButton(btn, 'Baixando...', async () => {
          const result = await api.downloadWhisperBinary();
          if (!result.ok) alert(`Falha ao baixar: ${result.error}`);
          await refresh();
        });
      });
      actions.appendChild(btn);
    }

    if (req.id === 'whisper-model') {
      const btn = actionButton('Baixar modelo "base" (~150 MB)', () => {
        withBusyButton(btn, 'Baixando...', async () => {
          const result = await api.downloadWhisperModel('base');
          if (!result.ok) alert(`Falha ao baixar: ${result.error}`);
          await refresh();
        });
      });
      actions.appendChild(btn);
    }

    if (actions.childElementCount > 0) card.appendChild(actions);
  }

  return card;
}

async function refresh(): Promise<void> {
  reqList.innerHTML = '<div class="req-detail">Verificando...</div>';
  const requirements = await api.checkAll();
  reqList.innerHTML = '';
  for (const req of requirements) {
    reqList.appendChild(renderRequirement(req));
  }
}

$('btnRecheck').addEventListener('click', () => refresh());
$('btnSkip').addEventListener('click', () => api.finish());
$('btnFinish').addEventListener('click', () => api.finish());

refresh();
