import './style.css';
import { appendLog, createInitialState } from './game/gameState';
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

const state = createInitialState();
const ui = new ExchangeUI(app, (command) => {
  executeCommand(state, command);
  ui.render(state);
}, {
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

appendLog(state, 'You wake in the cargo bay of a small merchant ship.');
appendLog(state, 'The docking lights of Vega Station flicker beyond the viewport.');
appendLog(state, 'Every port now hosts multiple named vendors with their own factions, price spreads, and loyalties.');
appendLog(state, 'Buy prices are always higher than sell prices. Profit now depends on planning cargo, timing, and faction relationships.');
appendLog(state, 'Each turn awards credits only. Keep food, water, and fuel above their reserve lines.');
appendLog(state, 'At the start of each round, there is a 50% chance of a random event and a 10% chance of a special market offer.');

ui.render(state);
