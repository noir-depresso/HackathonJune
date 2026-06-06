import { factionIds } from '../data/factions';
import { goods } from '../data/items';
import { locations } from '../data/locations';
import type { GameState, GoodId, TradeItemId } from '../types';
import {
  adjustRelationship,
  appendLog,
  cargoUsed,
  currentLocation,
  currentVendor,
  factionName,
  vendorsAtLocation,
} from './gameState';
import { advanceTurn, resolvePendingEvent } from './events';
import {
  allianceLabel,
  applyTradeRipple,
  buyStock,
  findOffer,
  formatRipple,
  influenceFactionStocks,
  influenceTradeItemStock,
  itemName,
  offerPrices,
  relationshipTier,
  sellStock,
  setStockLeverage,
  tradeRippleEntries,
} from './stockMarket';

export function showStatus(state: GameState): void {
  const location = currentLocation(state);
  const vendor = currentVendor(state);
  const factionState = state.diplomacy[vendor.factionId];

  appendLog(
    state,
    `STATUS
Credits: ${state.player.credits}
Location: ${location.name}
Counterparty: ${vendor.name} (${factionName(vendor.factionId)})
Relationship: ${factionState.relationship} (${relationshipTier(factionState.relationship)})
Alliance: ${allianceLabel(factionState.alliance)}
Food: ${state.player.supplies.food}
Water: ${state.player.supplies.water}
Fuel: ${state.player.supplies.fuel}
Cargo: ${cargoUsed(state)} / ${state.player.cargoCapacity}`
  );
}

export function showMarket(state: GameState): void {
  const vendor = currentVendor(state);
  const lines = vendor.stock
    .map((offer) => {
      const prices = offerPrices(state, vendor, offer);
      return `${itemName(offer.itemId).padEnd(14)} buy ${String(prices.ask).padEnd(4)}${
        prices.bid !== undefined ? ` sell ${prices.bid}` : ' sell -'
      }`;
    })
    .join('\n');

  appendLog(state, `MARKET - ${vendor.name}\n${vendor.role}\n${lines}`);
}

export function showRelations(state: GameState): void {
  const vendor = currentVendor(state);
  const factionState = state.diplomacy[vendor.factionId];
  const ripple = formatRipple(tradeRippleEntries(vendor.factionId, 2));

  appendLog(
    state,
    `RELATIONS - ${factionName(vendor.factionId)}
Relationship: ${factionState.relationship}
Tier: ${relationshipTier(factionState.relationship)}
Alliance: ${allianceLabel(factionState.alliance)}
Trade ripple: ${ripple}`
  );
}

export function showLedger(state: GameState): void {
  const lines = factionIds
    .map((factionId) => {
      return `${factionName(factionId)} | ${state.diplomacy[factionId].relationship} | ${allianceLabel(
        state.diplomacy[factionId].alliance
      )}`;
    })
    .join('\n');

  appendLog(state, `UNIVERSE LEDGER\n${lines}`);
}

export function selectVendor(state: GameState, vendorId: string): void {
  const vendor = vendorsAtLocation(state).find((entry) => entry.id === vendorId);

  if (!vendor) {
    appendLog(state, 'Unknown vendor at this port.');
    return;
  }

  state.selectedVendorId = vendor.id;
  state.activeSidebarTab = 'market';
  appendLog(state, `You open a channel to ${vendor.name}.\n${vendor.role} - ${vendor.bio}`);
}

function buy(state: GameState, itemIdText: string, amountText: string): void {
  const itemId = itemIdText as TradeItemId;
  const amount = Number(amountText);
  const vendor = currentVendor(state);
  const offer = findOffer(vendor, itemId);

  if (!offer || !Number.isInteger(amount) || amount <= 0) {
    appendLog(state, 'Invalid purchase. Example: buy ore 1');
    return;
  }

  const prices = offerPrices(state, vendor, offer);
  const totalCost = prices.ask * amount;

  if (state.player.credits < totalCost) {
    appendLog(state, `Not enough credits. Need ${totalCost} credits.`);
    return;
  }

  if (offer.kind === 'good' && cargoUsed(state) + amount > state.player.cargoCapacity) {
    appendLog(state, 'Not enough cargo space.');
    return;
  }

  state.player.credits -= totalCost;

  if (offer.kind === 'supply') {
    state.player.supplies[itemId as keyof typeof state.player.supplies] += amount;
  } else {
    state.player.cargo[itemId as GoodId] = (state.player.cargo[itemId as GoodId] ?? 0) + amount;
  }

  const ripple = applyTradeRipple(state, vendor.factionId, offer.kind === 'good' ? 2 : 1);
  influenceTradeItemStock(state, itemId, offer.kind === 'good' ? 0.006 : 0.003);
  appendLog(state, `Bought ${amount} ${itemName(itemId)} from ${vendor.name} for ${totalCost} credits.\nFaction ripple: ${ripple}.`);
}

function sell(state: GameState, itemIdText: string, amountText: string): void {
  const itemId = itemIdText as GoodId;
  const amount = Number(amountText);
  const vendor = currentVendor(state);
  const offer = findOffer(vendor, itemId);

  if (!offer || offer.bid === undefined || !Number.isInteger(amount) || amount <= 0) {
    appendLog(state, 'Invalid sale. Example: sell ore 1');
    return;
  }

  const owned = state.player.cargo[itemId] ?? 0;

  if (owned < amount) {
    appendLog(state, `You do not have enough ${goods[itemId].name}.`);
    return;
  }

  const prices = offerPrices(state, vendor, offer);
  const earned = (prices.bid ?? 0) * amount;

  state.player.credits += earned;
  state.player.cargo[itemId] = owned - amount;

  if (state.player.cargo[itemId] === 0) {
    delete state.player.cargo[itemId];
  }

  const ripple = applyTradeRipple(state, vendor.factionId, 2);
  influenceTradeItemStock(state, itemId, -0.003);
  appendLog(state, `Sold ${amount} ${goods[itemId].name} to ${vendor.name} for ${earned} credits.\nFaction ripple: ${ripple}.`);
}

function gift(state: GameState, amountText: string): void {
  const amount = Number(amountText);
  const vendor = currentVendor(state);

  if (!Number.isInteger(amount) || amount <= 0) {
    appendLog(state, 'Invalid gift. Example: gift 120');
    return;
  }

  if (state.player.credits < amount) {
    appendLog(state, `Not enough credits. Need ${amount} credits.`);
    return;
  }

  state.player.credits -= amount;

  const relationshipGain = Math.max(2, Math.min(18, Math.floor(amount / 30)));
  adjustRelationship(state, vendor.factionId, relationshipGain);
  influenceFactionStocks(state, vendor.factionId, Math.min(0.018, amount / 12000));

  appendLog(
    state,
    `You send a ${amount}-credit goodwill package to ${vendor.name}.\n${factionName(vendor.factionId)} relationship improves by ${relationshipGain}.`
  );
}

function requestTradePact(state: GameState): void {
  const vendor = currentVendor(state);
  const factionState = state.diplomacy[vendor.factionId];
  const fee = 140;

  if (factionState.alliance !== 'none') {
    appendLog(state, `${factionName(vendor.factionId)} already has a formal agreement with you.`);
    return;
  }

  if (factionState.relationship < 35) {
    appendLog(state, 'Relationship is too low for a trade pact. Reach at least 35 first.');
    return;
  }

  if (state.player.credits < fee) {
    appendLog(state, `Not enough credits. Need ${fee} credits for registry fees.`);
    return;
  }

  state.player.credits -= fee;
  factionState.alliance = 'trade_pact';
  adjustRelationship(state, vendor.factionId, 10);
  influenceFactionStocks(state, vendor.factionId, 0.02);

  appendLog(
    state,
    `${factionName(vendor.factionId)} signs a trade pact with your ship.\nYou now receive better terms from every vendor aligned with them.`
  );
}

function requestAlliance(state: GameState): void {
  const vendor = currentVendor(state);
  const factionState = state.diplomacy[vendor.factionId];
  const fee = 240;

  if (factionState.alliance === 'alliance') {
    appendLog(state, `${factionName(vendor.factionId)} is already bound to you by an alliance contract.`);
    return;
  }

  if (factionState.alliance !== 'trade_pact') {
    appendLog(state, 'You need a trade pact before requesting a full alliance.');
    return;
  }

  if (factionState.relationship < 75) {
    appendLog(state, 'Relationship is too low for an alliance. Reach at least 75 first.');
    return;
  }

  if (state.player.credits < fee) {
    appendLog(state, `Not enough credits. Need ${fee} credits for alliance guarantees.`);
    return;
  }

  state.player.credits -= fee;
  factionState.alliance = 'alliance';
  adjustRelationship(state, vendor.factionId, 8);
  influenceFactionStocks(state, vendor.factionId, 0.028);

  appendLog(state, `${factionName(vendor.factionId)} accepts an alliance contract.\nTheir vendors now treat you as a strategic partner.`);
}

function travel(state: GameState, destinationId: string): void {
  const location = currentLocation(state);
  const destination = locations[destinationId as keyof typeof locations];
  const fuelCost = location.routes[destinationId as keyof typeof location.routes];

  if (!destination || fuelCost === undefined) {
    appendLog(state, 'Unknown route.');
    return;
  }

  if (state.player.supplies.fuel < fuelCost) {
    appendLog(state, `Not enough fuel. Need ${fuelCost} fuel.`);
    return;
  }

  state.player.supplies.fuel -= fuelCost;
  state.player.locationId = destination.id;
  state.selectedVendorId = destination.vendors[0]?.id ?? null;
  state.activeSidebarTab = 'market';
  influenceFactionStocks(state, destination.governingFaction, 0.006);

  advanceTurn(
    state,
    `You travel to ${destination.name}.\n${destination.description}\nPort authority: ${factionName(destination.governingFaction)}.`
  );
}

function endTurn(state: GameState): void {
  advanceTurn(state, `You remain docked at ${currentLocation(state).name} and collect routine contract payouts.`);
}

export function executeCommand(state: GameState, command: string): void {
  if (state.gameOver) return;

  const normalizedCommand = command.trim().toLowerCase();
  const parts = normalizedCommand.split(/\s+/);
  const action = parts[0];

  if (!action) return;

  if (action !== 'clear') {
    appendLog(state, `> ${command}`);
  }

  if (
    state.pendingEvent &&
    !['status', 'relations', 'clear', 'ledger', 'market', 'bargain', 'stocks', 'stock', 'leverage', 'tab'].includes(action)
  ) {
    resolvePendingEvent(state, normalizedCommand);
    return;
  }

  if (action === 'status') {
    showStatus(state);
  } else if (action === 'market') {
    state.activeSidebarTab = 'market';
    showMarket(state);
  } else if (action === 'relations') {
    showRelations(state);
  } else if (action === 'ledger') {
    state.activeSidebarTab = 'ledger';
    showLedger(state);
  } else if (action === 'bargain') {
    state.activeSidebarTab = 'bargain';
  } else if (action === 'stocks') {
    state.activeSidebarTab = 'stocks';
  } else if (action === 'tab') {
    if (parts[1] === 'ledger') state.activeSidebarTab = 'ledger';
    if (parts[1] === 'market') state.activeSidebarTab = 'market';
    if (parts[1] === 'bargain') state.activeSidebarTab = 'bargain';
    if (parts[1] === 'stocks') state.activeSidebarTab = 'stocks';
  } else if (action === 'vendor') {
    selectVendor(state, parts[1] ?? '');
  } else if (action === 'buy') {
    buy(state, parts[1], parts[2]);
  } else if (action === 'sell') {
    sell(state, parts[1], parts[2]);
  } else if (action === 'gift') {
    gift(state, parts[1]);
  } else if (action === 'pact') {
    requestTradePact(state);
  } else if (action === 'alliance') {
    requestAlliance(state);
  } else if (action === 'travel') {
    travel(state, parts[1]);
  } else if (action === 'stock') {
    if (parts[1] === 'buy') {
      buyStock(state, parts[2], parts[3]);
    } else if (parts[1] === 'sell') {
      sellStock(state, parts[2], parts[3]);
    } else {
      appendLog(state, 'Invalid stock command. Use: stock buy vega_credit 1 or stock sell vega_credit 1.');
    }
  } else if (action === 'leverage') {
    setStockLeverage(state, parts[1]);
  } else if (action === 'end') {
    endTurn(state);
  } else if (action === 'clear') {
    state.log = [];
  } else {
    appendLog(state, `Unknown command: ${command}`);
  }
}
