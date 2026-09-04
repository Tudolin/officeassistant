import { spawn } from 'child_process';
import { getSettings } from '../config';

export interface ClaudeCallOptions {
  /** Restrict tool use; pass ['Read'] when the prompt references a local file (screenshot). */
  allowedTools?: string[];
  timeoutMs?: number;
}

/**
 * Invokes the user's local Claude Code CLI in non-interactive "print" mode and
 * returns the full text response. Requires `claude` to already be logged in
 * (claude /login) with the user's own subscription - no API key is used.
 */
export function askClaude(prompt: string, options: ClaudeCallOptions = {}): Promise<string> {
  const settings = getSettings();
  const args = ['-p', prompt, '--output-format', 'text'];

  if (settings.claudeModel) {
    args.push('--model', settings.claudeModel);
  }

  if (options.allowedTools && options.allowedTools.length > 0) {
    args.push('--allowedTools', options.allowedTools.join(','));
  } else {
    // Plain Q&A/translation calls never need file or shell access.
    args.push('--allowedTools', '');
  }

  // The overlay is meant for fast, unattended calls during a live meeting -
  // never block on an interactive permission prompt.
  args.push('--permission-mode', 'bypassPermissions');

  return new Promise((resolve, reject) => {
    const child = spawn(settings.claudeCliPath, args, {
      windowsHide: true,
      // Without this, the CLI waits ~3s to see if anything will be piped in
      // on stdin before proceeding - pure dead time for every single call
      // here, since none of them ever pipe input.
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeoutMs = options.timeoutMs ?? 45_000;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to launch Claude CLI ("${settings.claudeCliPath}"): ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `Claude CLI exited with code ${code}`));
      }
    });
  });
}

export function askClaudeAboutImage(imagePath: string, question: string): Promise<string> {
  const prompt = [
    `Read the image file at "${imagePath}".`,
    question?.trim()
      ? `Then help with this: ${question.trim()}`
      : 'Then explain what is shown, and if it is a coding problem, question, or exercise, solve it directly with a clear, ready-to-use answer.',
    'Be concise and go straight to the answer/solution - this is being read during a live meeting.',
  ].join('\n');

  return askClaude(prompt, { allowedTools: ['Read'] });
}

/**
 * Given the last ~45s of live transcript (mic + system audio, chronological),
 * finds the question being asked to the user and answers it directly. Meant
 * for spoken questions (e.g. an interviewer talking) that never touch the
 * screen, so screenshotAsk can't help - Ctrl+Shift+Space triggers this
 * instead of requiring the user to type the question out by hand.
 */
export function answerFromTranscript(transcriptText: string): Promise<string> {
  const prompt = [
    'You are helping someone answer questions live during a meeting or interview.',
    'Below is a transcript of the last ~45 seconds of conversation. "Voce" is the user\'s own microphone; "Outros" is the other participant(s).',
    '',
    'Transcript:',
    transcriptText,
    '',
    'This transcript comes from real-time speech-to-text, so expect run-on sentences, missing punctuation, and misheard words - the question may not be the very last line (it can be followed by more speech) and may be phrased awkwardly. Read past the noise and find the underlying question being asked to "Voce".',
    'The questions are usually simple/factual - prioritize being fast and correct over exhaustive.',
    'Reply in this exact compact format, in the same language as the question:',
    'Pergunta: <the question you identified, one line>',
    'Resposta: <a solid, correct, direct answer - 2-4 sentences max>',
    'Por que: <one short sentence justifying the answer>',
    '',
    'If no clear question is present, reply with exactly: "Nenhuma pergunta clara detectada nos ultimos 45s."',
    'Be concise - this is read live during a meeting. No preamble, no meta-commentary.',
  ].join('\n');

  return askClaude(prompt, { timeoutMs: 20_000 });
}

export function translateLine(text: string): Promise<string> {
  const prompt = [
    'You are a real-time meeting interpreter between Portuguese and English.',
    'Translate the following utterance to the other language of the pair (if it is Portuguese, translate to English; if English, translate to Portuguese).',
    'Reply with ONLY the translation, no explanations, no quotes.',
    '',
    `Utterance: ${text}`,
  ].join('\n');

  return askClaude(prompt, { timeoutMs: 20_000 });
}
