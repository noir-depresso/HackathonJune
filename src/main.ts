import './style.css';
import { appendLog, createInitialState, currentVendor } from './game/gameState';
import { executeCommand } from './game/commands';
import {
  acceptCounteroffer,
  cancelBargainingOffer,
  confirmBargainingOffer,
  selectBargainingFaction,
  submitBargainingOffer,
  submitFreeformBargainingMessage,
} from './game/bargainingSession';
import { ExchangeUI } from './ui/exchangeUI';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App element not found');
}

let state = createInitialState();
const ui = new ExchangeUI(app, handleCommand, {
  onSelectFaction: (factionId) => {
    selectBargainingFaction(state, factionId);
    ui.render(state);
  },
  onSubmitOffer: (offer) => {
    void submitBargainingOffer(state, offer).then(() => {
      ui.render(state);
    });
  },
  onConfirmOffer: () => {
    confirmBargainingOffer(state);
    ui.render(state);
  },
  onAcceptCounteroffer: () => {
    acceptCounteroffer(state);
    ui.render(state);
  },
  onCancelOffer: () => {
    cancelBargainingOffer(state);
    ui.render(state);
  },
  onSendMessage: (message) => {
    void submitFreeformBargainingMessage(state, message).then(() => {
      ui.render(state);
    });
  },
});

function handleCommand(command: string): void {
  void handleCommandAsync(command);
}

async function handleCommandAsync(command: string): Promise<void> {
  const normalizedCommand = command.trim().toLowerCase();

  if (isRestartCommand(normalizedCommand)) {
    state = createInitialState();
    startRun();
    ui.render(state);
    return;
  }

  if (isEndBargainCommand(normalizedCommand)) {
    cancelBargainingOffer(state);
    state.activeSidebarTab = 'market';
    appendLog(state, 'BARGAIN CLOSED\nYou close the negotiation channel and return to normal operations.');
    ui.render(state);
    return;
  }

  const handled = executeCommand(state, command);

  if (handled) {
    ui.render(state);
    return;
  }

  if (state.selectedVendorId) {
    const factionId = state.activeSidebarTab === 'bargain' ? state.bargaining.selectedFactionId : currentVendor(state).factionId;
    selectBargainingFaction(state, factionId);
    state.activeSidebarTab = 'bargain';
    await submitFreeformBargainingMessage(state, command);
    ui.render(state);
    return;
  }

  appendLog(state, `No active contact understands: ${command}`);
  ui.render(state);
}

function isEndBargainCommand(command: string): boolean {
  return /^(end|close|stop|exit|cancel)\s+(bargain|bargaining|negotiation|talk|chat)$/.test(command);
}

function isRestartCommand(command: string): boolean {
  return /^(restart|restart run|new run|try again|reboot)$/.test(command);
}

function startRun(): void {
  appendLog(state, 'You wake in the cargo bay of a small merchant ship.');
  appendLog(state, 'The docking lights of Vega Station flicker beyond the viewport.');
  appendLog(state, 'Every port now hosts multiple named vendors with their own factions, price spreads, and loyalties.');
  appendLog(state, 'Buy prices are always higher than sell prices. Profit now depends on planning cargo, timing, and faction relationships.');
  appendLog(state, 'Each turn awards credits only. Keep food, water, and fuel above their reserve lines.');
  appendLog(state, 'At the start of each round, there is a 50% chance of a random event and a 10% chance of a special market offer.');
}

startRun();
ui.render(state);
