import { Menu, Tray, nativeImage } from 'electron';
import path from 'path';

export interface TrayActions {
  toggleOverlay: () => void;
  openSettings: () => void;
  askClaude: () => void;
  screenshotAsk: () => void;
  toggleTranscription: () => void;
  toggleTranslation: () => void;
  toggleTeleprompter: () => void;
  openSetupWizard: () => void;
  quit: () => void;
}

let tray: Tray | null = null;

function iconPath(): string {
  // dist/main/tray.js -> ../../resources/tray-icon.png (resources sits next to dist,
  // both at the app root, in dev and once packaged).
  return path.join(__dirname, '..', '..', 'resources', 'tray-icon.png');
}

export function createTray(actions: TrayActions): Tray {
  const image = nativeImage.createFromPath(iconPath());
  tray = new Tray(image);
  tray.setToolTip('Meeting Copilot');

  const menu = Menu.buildFromTemplate([
    { label: 'Mostrar/Ocultar overlay', click: () => actions.toggleOverlay() },
    { type: 'separator' },
    { label: 'Perguntar ao Claude', click: () => actions.askClaude() },
    { label: 'Print + perguntar', click: () => actions.screenshotAsk() },
    { label: 'Transcrever reunião', click: () => actions.toggleTranscription() },
    { label: 'Tradução automática', click: () => actions.toggleTranslation() },
    { label: 'Modo roteiro', click: () => actions.toggleTeleprompter() },
    { type: 'separator' },
    { label: 'Verificar requisitos...', click: () => actions.openSetupWizard() },
    { label: 'Configurações', click: () => actions.openSettings() },
    { type: 'separator' },
    { label: 'Sair', click: () => actions.quit() },
  ]);

  tray.setContextMenu(menu);
  // Left click: quick-toggle the overlay (menu still available via right click on Windows).
  tray.on('click', () => actions.toggleOverlay());

  return tray;
}

export function getTray(): Tray | null {
  return tray;
}
