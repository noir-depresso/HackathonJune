import resources from '../data/resources.json';
import { formatBundle } from '../game/dialogue';
import type { FactionId, NegotiationOffer, NegotiationResult, ResourceBundle, ResourceId } from '../game/negotiation';

export type BargainingFactionView = {
  id: FactionId;
  name: string;
  relationshipWithPlayer: number;
  trust: number;
  anger: number;
  mood: string;
  inventory: ResourceBundle;
};

export type BargainingPanelState = {
  factions: BargainingFactionView[];
  selectedFactionId: FactionId;
  playerInventory: ResourceBundle;
  message: string;
  pendingOffer?: NegotiationOffer;
  pendingResult?: NegotiationResult;
};

export type BargainingHandlers = {
  onSelectFaction: (factionId: FactionId) => void;
  onSubmitOffer: (offer: NegotiationOffer) => void;
  onConfirmOffer: () => void;
  onAcceptCounteroffer: () => void;
  onCancelOffer: () => void;
};

export function renderBargainingPanel(state: BargainingPanelState): string {
  const selectedFaction = state.factions.find((faction) => faction.id === state.selectedFactionId) ?? state.factions[0];
  const offerResourceOptions = renderResourceOptions('credits');
  const requestResourceOptions = renderResourceOptions('water');

  return `
    <form id="bargaining-form" class="bargaining-form">
      <label>
        Faction
        <select id="bargain-faction">
          ${state.factions
            .map(
              (faction) =>
                `<option value="${faction.id}" ${faction.id === selectedFaction.id ? 'selected' : ''}>${faction.name}</option>`
            )
            .join('')}
        </select>
      </label>

      <div class="stat-row"><span>Relationship</span><strong>${selectedFaction.relationshipWithPlayer}</strong></div>
      <div class="stat-row"><span>Trust</span><strong>${selectedFaction.trust}</strong></div>
      <div class="stat-row"><span>Anger</span><strong>${selectedFaction.anger} / 100</strong></div>
      <div class="stat-row"><span>Mood</span><strong>${selectedFaction.mood}</strong></div>

      <div class="bargain-grid">
        <label>
          Offer
          <select id="offer-resource">${offerResourceOptions}</select>
        </label>
        <label>
          Amt
          <input id="offer-amount" type="number" min="1" value="25" />
        </label>
        <label>
          Request
          <select id="request-resource">${requestResourceOptions}</select>
        </label>
        <label>
          Amt
          <input id="request-amount" type="number" min="1" value="1" />
        </label>
      </div>

      <button class="command-button bargain-submit" type="submit">Transmit Offer</button>
    </form>

    <div class="bargain-inventory">
      <div><span class="muted">Your Stores</span><br />${formatBundle(state.playerInventory)}</div>
      <div><span class="muted">${selectedFaction.name} Stores</span><br />${formatBundle(selectedFaction.inventory)}</div>
    </div>

    <div id="bargain-message" class="bargain-message">${state.message}</div>

    ${renderPendingActions(state)}
  `;
}

export function bindBargainingControls(container: HTMLElement, handlers: BargainingHandlers): void {
  container.querySelector<HTMLSelectElement>('#bargain-faction')?.addEventListener('change', (event) => {
    handlers.onSelectFaction((event.currentTarget as HTMLSelectElement).value as FactionId);
  });

  container.querySelector<HTMLFormElement>('#bargaining-form')?.addEventListener('submit', (event) => {
    event.preventDefault();

    const factionId = readSelectValue(container, '#bargain-faction') as FactionId;
    const offerResource = readSelectValue(container, '#offer-resource') as ResourceId;
    const requestResource = readSelectValue(container, '#request-resource') as ResourceId;
    const offerAmount = readPositiveInteger(container, '#offer-amount');
    const requestAmount = readPositiveInteger(container, '#request-amount');

    handlers.onSubmitOffer({
      fromFaction: 'player',
      toFaction: factionId,
      offered: buildBundle(offerResource, offerAmount),
      requested: buildBundle(requestResource, requestAmount),
    });
  });

  container.querySelector<HTMLButtonElement>('#confirm-offer')?.addEventListener('click', handlers.onConfirmOffer);
  container.querySelector<HTMLButtonElement>('#accept-counteroffer')?.addEventListener('click', handlers.onAcceptCounteroffer);
  container.querySelector<HTMLButtonElement>('#cancel-offer')?.addEventListener('click', handlers.onCancelOffer);
}

function renderPendingActions(state: BargainingPanelState): string {
  if (!state.pendingOffer || !state.pendingResult) {
    return '';
  }

  if (state.pendingResult.outcome === 'accept') {
    return `
      <div class="bargain-actions">
        <button id="confirm-offer" class="command-button" type="button">Confirm Deal</button>
        <button id="cancel-offer" class="command-button" type="button">Cancel</button>
      </div>
    `;
  }

  if (state.pendingResult.outcome === 'counteroffer') {
    return `
      <div class="bargain-actions">
        <button id="accept-counteroffer" class="command-button" type="button">Accept Counter</button>
        <button id="cancel-offer" class="command-button" type="button">Revise</button>
      </div>
    `;
  }

  return `
    <div class="bargain-actions">
      <button id="cancel-offer" class="command-button" type="button">Revise</button>
    </div>
  `;
}

function readSelectValue(container: HTMLElement, selector: string): string {
  return container.querySelector<HTMLSelectElement>(selector)?.value ?? '';
}

function readPositiveInteger(container: HTMLElement, selector: string): number {
  const value = Number(container.querySelector<HTMLInputElement>(selector)?.value ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function buildBundle(resourceId: ResourceId, amount: number): ResourceBundle {
  return {
    [resourceId]: amount,
  };
}

function renderResourceOptions(selectedResourceId: ResourceId): string {
  return Object.entries(resources)
    .map(([resourceId, resource]) => {
      return `<option value="${resourceId}" ${resourceId === selectedResourceId ? 'selected' : ''}>${resource.name}</option>`;
    })
    .join('');
}
