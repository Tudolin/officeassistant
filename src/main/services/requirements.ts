import { spawn } from 'child_process';
import fs from 'fs';
import { systemPreferences } from 'electron';
import { getSettings } from '../config';
import { askClaude } from './claudeCli';

export type RequirementId = 'claude-cli' | 'claude-login' | 'whisper-binary' | 'whisper-model' | 'microphone';

export interface RequirementStatus {
  id: RequirementId;
  label: string;
  ok: boolean;
  detail: string;
}

function runVersionCheck(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, shell: process.platform === 'win32' });
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        child.kill();
        reject(new Error('timeout'));
      }
    }, 8000);
    child.on('error', (err) => {
      done = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      done = true;
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exit code ${code}`));
    });
  });
}

export async function checkClaudeCli(): Promise<RequirementStatus> {
  const settings = getSettings();
  try {
    await runVersionCheck(settings.claudeCliPath, ['--version']);
    return { id: 'claude-cli', label: 'Claude Code CLI instalado', ok: true, detail: 'Encontrado no PATH.' };
  } catch {
    return {
      id: 'claude-cli',
      label: 'Claude Code CLI instalado',
      ok: false,
      detail: `Não foi possível executar "${settings.claudeCliPath} --version".`,
    };
  }
}

export async function checkClaudeLogin(): Promise<RequirementStatus> {
  try {
    const out = await askClaude('Responda apenas com a palavra: ok', { timeoutMs: 20000 });
    const ok = /\bok\b/i.test(out);
    return {
      id: 'claude-login',
      label: 'Login no Claude ativo',
      ok,
      detail: ok ? 'Respondeu corretamente.' : `Resposta inesperada: "${out.slice(0, 120)}"`,
    };
  } catch (err) {
    return {
      id: 'claude-login',
      label: 'Login no Claude ativo',
      ok: false,
      detail: (err as Error).message,
    };
  }
}

export function checkWhisperBinary(): RequirementStatus {
  const settings = getSettings();
  const ok = !!settings.whisperBinaryPath && fs.existsSync(settings.whisperBinaryPath);
  return {
    id: 'whisper-binary',
    label: 'Binário whisper.cpp configurado',
    ok,
    detail: ok ? settings.whisperBinaryPath : 'Não configurado ou arquivo não encontrado.',
  };
}

export function checkWhisperModel(): RequirementStatus {
  const settings = getSettings();
  const ok = !!settings.whisperModelPath && fs.existsSync(settings.whisperModelPath);
  return {
    id: 'whisper-model',
    label: 'Modelo whisper (.bin) configurado',
    ok,
    detail: ok ? settings.whisperModelPath : 'Não configurado ou arquivo não encontrado.',
  };
}

export function checkMicrophone(): RequirementStatus {
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    const ok = status === 'granted' || status === 'unknown';
    return {
      id: 'microphone',
      label: 'Permissão de microfone',
      ok,
      detail:
        status === 'denied'
          ? 'Bloqueada. Ative em Configurações do Windows > Privacidade > Microfone.'
          : `Status: ${status}.`,
    };
  } catch {
    return {
      id: 'microphone',
      label: 'Permissão de microfone',
      ok: true,
      detail: 'Não foi possível verificar automaticamente; será solicitada no primeiro uso.',
    };
  }
}

export async function checkAllRequirements(): Promise<RequirementStatus[]> {
  const [claudeCli, claudeLogin] = await Promise.all([checkClaudeCli(), checkClaudeLogin()]);
  return [claudeCli, claudeLogin, checkWhisperBinary(), checkWhisperModel(), checkMicrophone()];
}
