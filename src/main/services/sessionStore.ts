import fs from 'fs';
import path from 'path';
import { getDataDir } from '../config';
import type { AssistantMessage, MeetingSession, TranscriptLine } from '../../shared/types';

let active: MeetingSession | null = null;

function ensureDataDir(): string {
  const dir = path.join(getDataDir(), 'sessions');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function newSession(): MeetingSession {
  const now = Date.now();
  return {
    id: String(now),
    startedAt: now,
    title: new Date(now).toLocaleString('pt-BR'),
    transcript: [],
    notes: '',
    assistantLog: [],
  };
}

export function getActiveSession(): MeetingSession {
  if (!active) {
    active = newSession();
  }
  return active;
}

export function startNewMeeting(): MeetingSession {
  if (active) persistToDisk(active);
  active = newSession();
  return active;
}

export function addTranscriptLine(line: TranscriptLine): void {
  getActiveSession().transcript.push(line);
  persistToDisk(getActiveSession());
}

export function updateTranscriptLine(id: string, patch: Partial<TranscriptLine>): void {
  const session = getActiveSession();
  const line = session.transcript.find((l) => l.id === id);
  if (line) Object.assign(line, patch);
  persistToDisk(session);
}

/** Transcript lines whose timestamp falls within the last `windowMs`, oldest first. */
export function getRecentTranscript(windowMs: number): TranscriptLine[] {
  const cutoff = Date.now() - windowMs;
  return getActiveSession().transcript.filter((line) => line.timestamp >= cutoff);
}

export function addAssistantMessage(message: AssistantMessage): void {
  getActiveSession().assistantLog.push(message);
  persistToDisk(getActiveSession());
}

export function updateNotes(notes: string): void {
  getActiveSession().notes = notes;
  persistToDisk(getActiveSession());
}

function persistToDisk(session: MeetingSession): void {
  try {
    const dir = ensureDataDir();
    const filePath = path.join(dir, `${session.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
  } catch (err) {
    console.error('[sessionStore] failed to persist session:', (err as Error).message);
  }
}

export function exportSessionMarkdown(session: MeetingSession): string {
  const lines: string[] = [];
  lines.push(`# Reuniao - ${session.title}`, '');
  lines.push('## Transcricao', '');
  for (const line of session.transcript) {
    const who = line.speaker === 'you' ? 'Voce' : 'Outros';
    const time = new Date(line.timestamp).toLocaleTimeString('pt-BR');
    lines.push(`**[${time}] ${who}:** ${line.text}`);
    if (line.translation) lines.push(`> _${line.translation}_`);
  }
  lines.push('', '## Anotacoes', '', session.notes || '_(vazio)_');
  return lines.join('\n');
}
