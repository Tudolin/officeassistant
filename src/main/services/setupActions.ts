import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import { getSettings, setSettings } from '../config';

export type ProgressCallback = (item: 'whisper-binary' | 'whisper-model', received: number, total: number) => void;
export type LogCallback = (line: string) => void;

const GITHUB_LATEST_RELEASE_URL = 'https://api.github.com/repos/ggml-org/whisper.cpp/releases/latest';
const HUGGINGFACE_MODEL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'meeting-copilot', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`Falha ao consultar ${url}: HTTP ${res.status}`);
  return res.json();
}

async function downloadFile(url: string, dest: string, onProgress?: (received: number, total: number) => void): Promise<void> {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'meeting-copilot' } });
  if (!res.ok || !res.body) throw new Error(`Falha ao baixar ${url}: HTTP ${res.status}`);

  const total = Number(res.headers.get('content-length') ?? 0);
  let received = 0;
  const fileStream = fs.createWriteStream(dest);
  const reader = res.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      await new Promise<void>((resolve, reject) => fileStream.write(value, (err) => (err ? reject(err) : resolve())));
      onProgress?.(received, total);
    }
  } finally {
    await new Promise<void>((resolve, reject) => fileStream.end((err?: Error | null) => (err ? reject(err) : resolve())));
  }
}

function findFileRecursive(dir: string, pattern: RegExp): string | null {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFileRecursive(full, pattern);
      if (found) return found;
    } else if (pattern.test(entry.name)) {
      return full;
    }
  }
  return null;
}

/** Installs the Claude Code CLI globally via npm (requires Node/npm on the user's machine). */
export function installClaudeCliViaNpm(onLog: LogCallback): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '-g', '@anthropic-ai/claude-code'], {
      windowsHide: true,
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (chunk) => onLog(chunk.toString('utf8')));
    child.stderr.on('data', (chunk) => onLog(chunk.toString('utf8')));
    child.on('error', (err) => reject(new Error(`Não foi possível executar npm: ${err.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm install saiu com código ${code}`));
    });
  });
}

/**
 * Opens a visible terminal running `claude /login` so the user can complete
 * the browser-based OAuth flow. We can't do this headlessly/silently.
 */
export function openClaudeLoginTerminal(): void {
  const settings = getSettings();
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', settings.claudeCliPath, '/login'], {
      detached: true,
      shell: false,
      windowsHide: false,
    }).unref();
  } else {
    // Dev/testing on non-Windows: just run it inline in the app's own terminal.
    spawn(settings.claudeCliPath, ['/login'], { stdio: 'inherit', detached: true }).unref();
  }
}

/** Downloads a prebuilt Windows x64 whisper.cpp CPU binary and points settings at it. */
export async function downloadWhisperBinary(onProgress: ProgressCallback): Promise<string> {
  const release = await fetchJson(GITHUB_LATEST_RELEASE_URL);
  const assets: Array<{ name: string; browser_download_url: string }> = release.assets ?? [];

  const asset =
    assets.find((a) => /win/i.test(a.name) && /x64/i.test(a.name) && !/cuda|clblast|hip|sycl|cublas/i.test(a.name)) ??
    assets.find((a) => /win/i.test(a.name) && !/cuda|clblast|hip|sycl|cublas/i.test(a.name));

  if (!asset) {
    throw new Error(
      'Não encontrei um pacote Windows x64 (CPU) na última release do whisper.cpp. Baixe manualmente e configure o caminho.'
    );
  }

  const zipPath = path.join(os.tmpdir(), asset.name);
  await downloadFile(asset.browser_download_url, zipPath, (received, total) => onProgress('whisper-binary', received, total));

  const destDir = path.join(app.getPath('userData'), 'whisper', 'bin');
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
  fs.rmSync(zipPath, { force: true });

  // Prefer whisper-cli.exe: recent whisper.cpp releases keep a deprecated
  // main.exe stub alongside it that only prints a "use whisper-cli.exe
  // instead" notice and exits without transcribing anything - and since
  // it comes first alphabetically, a plain single-pattern search would
  // silently pick that dead stub over the real binary.
  const exePath = findFileRecursive(destDir, /^whisper-cli\.exe$/i) ?? findFileRecursive(destDir, /^main\.exe$/i);
  if (!exePath) {
    throw new Error('O pacote baixado não contém whisper-cli.exe/main.exe. Configure o caminho manualmente.');
  }

  setSettings({ whisperBinaryPath: exePath });
  return exePath;
}

/** Downloads a ggml multilingual model (default: small) from the official whisper.cpp Hugging Face repo. */
export async function downloadWhisperModel(
  modelName: 'tiny' | 'base' | 'small' | 'medium' = 'small',
  onProgress: ProgressCallback
): Promise<string> {
  const url = `${HUGGINGFACE_MODEL_BASE}/ggml-${modelName}.bin`;
  const destDir = path.join(app.getPath('userData'), 'whisper', 'models');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, `ggml-${modelName}.bin`);

  await downloadFile(url, destPath, (received, total) => onProgress('whisper-model', received, total));

  setSettings({ whisperModelPath: destPath });
  return destPath;
}
