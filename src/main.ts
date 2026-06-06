import './style.css';
import factions from './data/factions.json';
import {
  generateBargainingAIMessage,
  generateFactionChatMessage,
  requestStructuredBargainingIntent,
} from './game/bargainingAI';
import { formatBundle, generateDialogue } from './game/dialogue';
import { evaluateStructuredBargain } from './game/freeformBargaining';
import { evaluateOffer } from './game/negotiation';
import { relationshipDeltaAfterTrade } from './game/relationships';
import { applyTradeToInventories } from './game/trade';
import { bindBargainingControls, renderBargainingPanel } from './ui/bargainingUI';
import type { BargainingFactionView } from './ui/bargainingUI';
import type {
  Faction,
  FactionId,
  NegotiationOffer,
  NegotiationResult,
  ResourceBundle,
  ResourceId,
} from './game/negotiation';
import type { Inventory } from './game/trade';

type GoodId =
  | 'water'
  | 'medicine'
  | 'ore'
  | 'fuel_cells'
  | 'star_silk'
  | 'alien_relics';

type LocationId = 'vega' | 'sirius' | 'nova7';

type Good = {
  id: GoodId;
  name: string;
};

type Location = {
  id: LocationId;
  name: string;
  description: string;
  prices: Record<GoodId, number>;
  routes: Partial<Record<LocationId, number>>;
};

type MarketStocks = Record<LocationId, Record<GoodId, number>>;

type Player = {
  day: number;
  credits: number;
  fuel: number;
  locationId: LocationId;
  cargoCapacity: number;
  cargo: Partial<Record<GoodId, number>>;
};

const goods: Record<GoodId, Good> = {
  water: { id: 'water', name: 'Water' },
  medicine: { id: 'medicine', name: 'Medicine' },
  ore: { id: 'ore', name: 'Ore' },
  fuel_cells: { id: 'fuel_cells', name: 'Fuel Cells' },
  star_silk: { id: 'star_silk', name: 'Star Silk' },
  alien_relics: { id: 'alien_relics', name: 'Alien Relics' },
};

const locations: Record<LocationId, Location> = {
  vega: {
    id: 'vega',
    name: 'Vega Station',
    description: 'A polished trade hub orbiting a blue-white star.',
    prices: {
      water: 12,
      medicine: 95,
      ore: 35,
      fuel_cells: 50,
      star_silk: 210,
      alien_relics: 500,
    },
    routes: {
      sirius: 15,
      nova7: 30,
    },
  },
  sirius: {
    id: 'sirius',
    name: 'Sirius Outpost',
    description: 'A mining colony with cheap ore and nervous guards.',
    prices: {
      water: 18,
      medicine: 120,
      ore: 20,
      fuel_cells: 65,
      star_silk: 260,
      alien_relics: 620,
    },
    routes: {
      vega: 15,
      nova7: 20,
    },
  },
  nova7: {
    id: 'nova7',
    name: 'Nova-7 Colony',
    description: 'A frontier colony always short on supplies.',
    prices: {
      water: 35,
      medicine: 155,
      ore: 28,
      fuel_cells: 80,
      star_silk: 240,
      alien_relics: 700,
    },
    routes: {
      vega: 30,
      sirius: 20,
    },
  },
};

const basePrices: Record<LocationId, Record<GoodId, number>> = structuredClone(
  Object.fromEntries(
    Object.entries(locations).map(([locationId, location]) => [locationId, location.prices])
  )
) as Record<LocationId, Record<GoodId, number>>;

const marketStocks: MarketStocks = {
  vega: {
    water: 90,
    medicine: 18,
    ore: 44,
    fuel_cells: 36,
    star_silk: 8,
    alien_relics: 2,
  },
  sirius: {
    water: 42,
    medicine: 10,
    ore: 140,
    fuel_cells: 24,
    star_silk: 5,
    alien_relics: 1,
  },
  nova7: {
    water: 16,
    medicine: 7,
    ore: 58,
    fuel_cells: 18,
    star_silk: 3,
    alien_relics: 1,
  },
};

const player: Player = {
  day: 1,
  credits: 1200,
  fuel: 80,
  locationId: 'vega',
  cargoCapacity: 30,
  cargo: {},
};

const factionAliases: Record<string, FactionId> = {
  vega: 'vega_union',
  vega_union: 'vega_union',
  eclipse: 'eclipse_combine',
  eclipse_combine: 'eclipse_combine',
  nova: 'nova_frontier',
  nova_frontier: 'nova_frontier',
};

const factionStates = structuredClone(factions) as Record<FactionId, Faction>;
const bargainingState: {
  selectedFactionId: FactionId;
  message: string;
  pendingOffer?: NegotiationOffer;
  pendingResult?: NegotiationResult;
} = {
  selectedFactionId: 'vega_union',
  message: 'Choose a faction, make an offer, and the bargaining AI will answer.',
};

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App element not found');
}

app.innerHTML = `
  <div class="equation-bg" aria-hidden="true">
    <span>V = p x q</span>
    <span>delta credits = sell - buy</span>
    <span>stock(t+1) = stock(t) + supply - demand</span>
    <span>price = base x demand / stock</span>
    <span>trust += fair_trade</span>
    <span>risk = greed / trust</span>
    <span>counter = ceil(offer x 1.15)</span>
    <span>margin = revenue - cost</span>
    <span>scarcity -> price up</span>
    <span>cargo <= capacity</span>
  </div>
  <div class="era-window">
    <header class="era-header">
      <div>STAR TRADER</div>
      <div id="header-location"></div>
      <div id="header-day"></div>
    </header>

    <main class="era-main">
      <section class="era-log" id="log"></section>

      <aside class="era-sidebar">
        <section class="era-box">
          <h2>STATUS</h2>
          <div id="status"></div>
        </section>

        <section class="era-box">
          <h2>CARGO</h2>
          <div id="cargo"></div>
        </section>

        <section class="era-box">
          <h2>MARKET</h2>
          <div id="market"></div>
        </section>

        <section class="era-box">
          <h2>BARGAINING AI</h2>
          <div id="bargaining"></div>
        </section>
      </aside>
    </main>

    <footer class="era-command-area">
      <div class="era-command-title">COMMAND</div>
      <div id="commands" class="era-command-grid"></div>

      <form id="manual-form" class="manual-form">
        <span>&gt;</span>
        <input id="manual-input" placeholder="try: I offer Vega 140 credits for 1 medicine as humanitarian aid" autocomplete="off" />
      </form>
    </footer>
  </div>
`;

const logEl = document.querySelector<HTMLDivElement>('#log')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const cargoEl = document.querySelector<HTMLDivElement>('#cargo')!;
const marketEl = document.querySelector<HTMLDivElement>('#market')!;
const bargainingEl = document.querySelector<HTMLDivElement>('#bargaining')!;
const commandsEl = document.querySelector<HTMLDivElement>('#commands')!;
const headerLocationEl = document.querySelector<HTMLDivElement>('#header-location')!;
const headerDayEl = document.querySelector<HTMLDivElement>('#header-day')!;
const manualForm = document.querySelector<HTMLFormElement>('#manual-form')!;
const manualInput = document.querySelector<HTMLInputElement>('#manual-input')!;

function currentLocation(): Location {
  return locations[player.locationId];
}

function cargoUsed(): number {
  return Object.values(player.cargo).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

function playerInventory(): Inventory {
  return {
    credits: player.credits,
    ...player.cargo,
  };
}

function commitPlayerInventory(inventory: Inventory): void {
  player.credits = inventory.credits ?? 0;
  player.cargo = {};

  for (const [resourceId, amount] of Object.entries(inventory)) {
    const id = resourceId as ResourceId;

    if (id !== 'credits' && amount && amount > 0 && isGoodId(id)) {
      player.cargo[id] = amount;
    }
  }
}

function isGoodId(resourceId: ResourceId): resourceId is GoodId {
  return resourceId in goods;
}

function log(message: string): void {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function render(): void {
  const location = currentLocation();

  headerLocationEl.textContent = location.name;
  headerDayEl.textContent = `DAY ${player.day}`;

  statusEl.innerHTML = `
    <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
    <div class="stat-row"><span>Fuel</span><strong>${player.fuel}</strong></div>
    <div class="stat-row"><span>Location</span><strong>${location.name}</strong></div>
    <div class="stat-row"><span>Cargo</span><strong>${cargoUsed()} / ${player.cargoCapacity}</strong></div>
  `;

  const cargoEntries = Object.entries(player.cargo);

  cargoEl.innerHTML =
    cargoEntries.length === 0
      ? `<div class="muted">Empty</div>`
      : cargoEntries
          .map(([goodId, amount]) => {
            const good = goods[goodId as GoodId];
            return `<div class="stat-row"><span>${good.name}</span><strong>${amount}</strong></div>`;
          })
          .join('');

  marketEl.innerHTML = Object.values(goods)
    .map((good) => {
      const price = location.prices[good.id];
      const stock = marketStocks[location.id][good.id];
      return `<div class="stat-row"><span>${good.name}</span><strong>${price} cr / ${stock} stk</strong></div>`;
    })
    .join('');

  renderCommands();
  renderBargaining();
}

function renderCommands(): void {
  const location = currentLocation();
  let index = 1;

  const commandButtons: { label: string; command: string }[] = [
    { label: 'Status', command: 'status' },
    { label: 'Market', command: 'market' },
    { label: 'Buy Water', command: 'buy water 1' },
    { label: 'Buy Medicine', command: 'buy medicine 1' },
    { label: 'Sell Water', command: 'sell water 1' },
    { label: 'Sell Medicine', command: 'sell medicine 1' },
    { label: 'Bargain AI', command: 'bargain' },
    { label: 'Sample Offer', command: 'I offer Vega 140 credits for 1 medicine as humanitarian aid' },
  ];

  for (const [destinationId, fuelCost] of Object.entries(location.routes)) {
    const destination = locations[destinationId as LocationId];
    commandButtons.push({
      label: `Travel ${destination.name} (${fuelCost} fuel)`,
      command: `travel ${destinationId}`,
    });
  }

  commandButtons.push({ label: 'Clear Log', command: 'clear' });

  commandsEl.innerHTML = commandButtons
    .map((button) => {
      const number = index++;
      return `
        <button class="command-button" data-command="${button.command}">
          <span class="command-number">${number}</span>
          ${button.label}
        </button>
      `;
    })
    .join('');

  document.querySelectorAll<HTMLButtonElement>('.command-button').forEach((button) => {
    button.addEventListener('click', () => {
      executeCommand(button.dataset.command ?? '');
    });
  });
}

function renderBargaining(): void {
  bargainingEl.innerHTML = renderBargainingPanel({
    factions: bargainingFactionViews(),
    selectedFactionId: bargainingState.selectedFactionId,
    playerInventory: playerInventory(),
    message: bargainingState.message,
    pendingOffer: bargainingState.pendingOffer,
    pendingResult: bargainingState.pendingResult,
  });

  bindBargainingControls(bargainingEl, {
    onSelectFaction: (factionId) => {
      bargainingState.selectedFactionId = factionId;
      bargainingState.pendingOffer = undefined;
      bargainingState.pendingResult = undefined;
      bargainingState.message = 'Faction channel changed. Make a new offer when ready.';
      render();
    },
    onSubmitOffer: (offer) => {
      void submitBargainingOffer(offer);
    },
    onConfirmOffer: confirmPendingOffer,
    onAcceptCounteroffer: acceptCounteroffer,
    onCancelOffer: cancelPendingOffer,
  });
}

function bargainingFactionViews(): BargainingFactionView[] {
  return Object.entries(factionStates).map(([factionId, faction]) => ({
    id: factionId as FactionId,
    name: faction.name,
    relationshipWithPlayer: faction.relationshipWithPlayer,
    trust: faction.trust,
    inventory: faction.inventory as ResourceBundle,
  }));
}

function showStatus(): void {
  const location = currentLocation();

  log(
    `STATUS
Credits: ${player.credits}
Fuel: ${player.fuel}
Location: ${location.name}
Cargo: ${cargoUsed()} / ${player.cargoCapacity}`
  );
}

function showMarket(): void {
  const location = currentLocation();

  const lines = Object.values(goods)
    .map((good) => {
      const stock = marketStocks[location.id][good.id];
      return `${good.name.padEnd(14)} ${String(location.prices[good.id]).padStart(4)} credits | stock ${stock}`;
    })
    .join('\n');

  log(`MARKET - ${location.name}\n${lines}`);
}

function showBargainingHelp(): void {
  const factionsList = Object.values(factionStates)
    .map((faction) => `${faction.name}: ${faction.ideology}`)
    .join('\n');

  log(`BARGAINING AI
Use the panel on the right, or type an offer directly.
Pending accepted deals only apply after you press Confirm Deal.

Examples:
offer credits 140 for medicine 1
offer eclipse credits 500 for alien_relics 1
offer nova water 5 for ore 2
I offer Nova 1000 credits for 1 ore because free colonies should stand together.
I have 999 water and offer it to Vega for medicine.

${factionsList}`);
}

function buy(goodId: string, amountText: string): void {
  const good = goods[goodId as GoodId];
  const amount = Number(amountText);

  if (!good || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid purchase. Example: buy water 3');
    return;
  }

  const location = currentLocation();
  const totalCost = location.prices[good.id] * amount;
  const availableStock = marketStocks[location.id][good.id];

  if (player.credits < totalCost) {
    log(`Not enough credits. Need ${totalCost} credits.`);
    return;
  }

  if (availableStock < amount) {
    log(`${location.name} only has ${availableStock} ${good.name} in stock.`);
    return;
  }

  if (cargoUsed() + amount > player.cargoCapacity) {
    log('Not enough cargo space.');
    return;
  }

  player.credits -= totalCost;
  player.cargo[good.id] = (player.cargo[good.id] ?? 0) + amount;
  marketStocks[location.id][good.id] -= amount;
  recalculatePrice(location.id, good.id);

  log(
    `Bought ${amount} ${good.name} for ${totalCost} credits.\n${location.name} stock: ${marketStocks[location.id][good.id]} ${good.name}. New price: ${location.prices[good.id]} credits.`
  );
}

function sell(goodId: string, amountText: string): void {
  const good = goods[goodId as GoodId];
  const amount = Number(amountText);

  if (!good || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid sale. Example: sell water 3');
    return;
  }

  const owned = player.cargo[good.id] ?? 0;

  if (owned < amount) {
    log(`You do not have enough ${good.name}.`);
    return;
  }

  const location = currentLocation();
  const earned = location.prices[good.id] * amount;

  player.credits += earned;
  player.cargo[good.id] = owned - amount;
  marketStocks[location.id][good.id] += amount;
  recalculatePrice(location.id, good.id);

  if (player.cargo[good.id] === 0) {
    delete player.cargo[good.id];
  }

  log(
    `Sold ${amount} ${good.name} for ${earned} credits.\n${location.name} stock: ${marketStocks[location.id][good.id]} ${good.name}. New price: ${location.prices[good.id]} credits.`
  );
}

function travel(destinationId: string): void {
  const location = currentLocation();
  const destination = locations[destinationId as LocationId];
  const fuelCost = location.routes[destinationId as LocationId];

  if (!destination || fuelCost === undefined) {
    log('Unknown route.');
    return;
  }

  if (player.fuel < fuelCost) {
    log(`Not enough fuel. Need ${fuelCost} fuel.`);
    return;
  }

  player.fuel -= fuelCost;
  player.locationId = destination.id;
  player.day += 1;
  tickMarkets();

  log(`You travel to ${destination.name}.\n${destination.description}\nMarkets update for day ${player.day}.`);
}

async function submitBargainingOffer(offer: NegotiationOffer): Promise<void> {
  const faction = factionStates[offer.toFaction];
  const result = evaluateOffer(offer, faction);
  const fallbackDialogue = generateDialogue(result, faction.name);

  bargainingState.selectedFactionId = offer.toFaction;
  bargainingState.pendingOffer = offer;
  bargainingState.pendingResult = result;
  bargainingState.message = 'Transmission sent. Awaiting faction response...';
  render();

  const aiMessage = await generateBargainingAIMessage({
    factionName: faction.name,
    factionPersonality: faction.personality,
    offer,
    result,
    fallbackDialogue,
  });

  bargainingState.message = aiMessage;
  log(`${faction.name}: ${aiMessage}`);
  render();
}

async function submitFreeformBargainingMessage(message: string): Promise<void> {
  bargainingState.message = 'Parsing bargain into structured JSON...';
  render();

  const structured = await requestStructuredBargainingIntent({
    message,
    selectedFactionId: bargainingState.selectedFactionId,
    factionAliases,
    playerInventory: playerInventory(),
    factionInventories: factionInventorySnapshot(),
  });
  const freeformResult = evaluateStructuredBargain(structured, factionStates, playerInventory());
  const faction = factionStates[structured.toFaction];

  bargainingState.selectedFactionId = structured.toFaction;
  bargainingState.pendingOffer =
    freeformResult.computedResult.outcome === 'accept' ||
    freeformResult.computedResult.outcome === 'counteroffer'
      ? freeformResult.offer
      : undefined;
  bargainingState.pendingResult = freeformResult.computedResult;

  if (freeformResult.computedResult.reason === 'lie_detected') {
    applyRelationshipChange(structured.toFaction, freeformResult.computedResult);
  }

  if (freeformResult.computedResult.reason === 'overly_good_suspicious') {
    applyRelationshipChange(structured.toFaction, freeformResult.computedResult);
  }

  if (!freeformResult.offer) {
    const missing = structured.missingInfo.join(', ') || 'a clear offer';
    const responseMessage = /\d/.test(message)
      ? `${faction.name}: Clarify ${missing}.`
      : await generateFactionChatMessage({
          message,
          factionName: faction.name,
          factionIdeology: faction.ideology,
          factionPersonality: faction.personality,
          relationshipWithPlayer: faction.relationshipWithPlayer,
          trust: faction.trust,
          playerInventory: playerInventory(),
          factionInventory: faction.inventory as ResourceBundle,
          lastBargainingMessage: bargainingState.message,
        });

    bargainingState.message = responseMessage;
    log(responseMessage);
    render();
    return;
  }

  const fallbackDialogue = generateDialogue(freeformResult.computedResult, faction.name);
  const aiMessage = await generateBargainingAIMessage({
    factionName: faction.name,
    factionPersonality: faction.personality,
    offer: freeformResult.offer,
    result: freeformResult.computedResult,
    fallbackDialogue,
    structuredIntent: structured,
    audit: freeformResult.audit,
  });

  bargainingState.message = aiMessage;
  log(`STRUCTURED JSON ${JSON.stringify(structured)}`);
  log(`COMPUTER RESULT ${JSON.stringify({
    outcome: freeformResult.computedResult.outcome,
    reason: freeformResult.computedResult.reason,
    score: Math.round(freeformResult.computedResult.score),
    liesDetected: freeformResult.audit.liesDetected,
    overlyGoodDeal: freeformResult.audit.overlyGoodDeal,
  })}`);
  log(`${faction.name}: ${aiMessage}`);
  render();
}

function factionInventorySnapshot(): Record<FactionId, ResourceBundle> {
  return Object.entries(factionStates).reduce((snapshot, [factionId, faction]) => {
    snapshot[factionId as FactionId] = faction.inventory as ResourceBundle;
    return snapshot;
  }, {} as Record<FactionId, ResourceBundle>);
}

function confirmPendingOffer(): void {
  if (!bargainingState.pendingOffer || bargainingState.pendingResult?.outcome !== 'accept') {
    return;
  }

  applyBargainingTrade(bargainingState.pendingOffer, bargainingState.pendingResult);
}

function acceptCounteroffer(): void {
  const counteroffer = bargainingState.pendingResult?.counteroffer;

  if (!counteroffer || !bargainingState.pendingResult) {
    return;
  }

  applyBargainingTrade(counteroffer, {
    ...bargainingState.pendingResult,
    outcome: 'accept',
    reason: 'fair',
  });
}

function cancelPendingOffer(): void {
  bargainingState.pendingOffer = undefined;
  bargainingState.pendingResult = undefined;
  bargainingState.message = 'Offer cleared. Revise your terms and transmit again.';
  render();
}

function applyBargainingTrade(offer: NegotiationOffer, result: NegotiationResult): void {
  const faction = factionStates[offer.toFaction];
  const inventory = playerInventory();
  const beforeCredits = player.credits;
  const beforeCargo = cargoUsed();
  const beforeFactionInventory = { ...(faction.inventory as Inventory) };
  const tradeResult = applyTradeToInventories(
    inventory,
    faction.inventory as Inventory,
    offer.offered,
    offer.requested
  );

  if (!tradeResult.success) {
    bargainingState.message = tradeResult.message;
    log(tradeResult.message);
    render();
    return;
  }

  commitPlayerInventory(inventory);
  applyRelationshipChange(offer.toFaction, result);
  applyBargainMarketPressure(offer);

  const message = `Deal completed: ${formatBundle(offer.offered)} for ${formatBundle(offer.requested)}.
Credits: ${beforeCredits} -> ${player.credits}
Cargo used: ${beforeCargo} -> ${cargoUsed()}
${faction.name} stores changed: ${formatBundle(beforeFactionInventory)} -> ${formatBundle(faction.inventory as Inventory)}`;
  bargainingState.pendingOffer = undefined;
  bargainingState.pendingResult = undefined;
  bargainingState.message = message;
  log(message);
  render();
}

function recalculatePrice(locationId: LocationId, goodId: GoodId): void {
  const basePrice = basePrices[locationId][goodId];
  const stock = marketStocks[locationId][goodId];
  const pressure = stock <= 0 ? 2.2 : Math.max(0.55, Math.min(2.2, 42 / stock));
  locations[locationId].prices[goodId] = Math.max(1, Math.round(basePrice * pressure));
}

function tickMarkets(): void {
  for (const [locationId, stocks] of Object.entries(marketStocks) as [LocationId, Record<GoodId, number>][]) {
    for (const goodId of Object.keys(goods) as GoodId[]) {
      const drift = dailyStockDrift(locationId, goodId, player.day);
      stocks[goodId] = Math.max(0, stocks[goodId] + drift);
      recalculatePrice(locationId, goodId);
    }
  }
}

function dailyStockDrift(locationId: LocationId, goodId: GoodId, day: number): number {
  const productionBias: Partial<Record<LocationId, Partial<Record<GoodId, number>>>> = {
    vega: { water: 3, fuel_cells: 2, star_silk: 1 },
    sirius: { ore: 5, fuel_cells: 1 },
    nova7: { water: -2, medicine: -1, ore: 2 },
  };
  const baseDrift = productionBias[locationId]?.[goodId] ?? 0;
  const marketNoise = ((day + goodId.length + locationId.length) % 3) - 1;

  return baseDrift + marketNoise;
}

function applyBargainMarketPressure(offer: NegotiationOffer): void {
  const location = currentLocation();

  for (const [resourceId, amount] of Object.entries(offer.requested)) {
    if (resourceId !== 'credits' && isGoodId(resourceId as ResourceId)) {
      const id = resourceId as GoodId;
      marketStocks[location.id][id] = Math.max(0, marketStocks[location.id][id] - Math.ceil((amount ?? 0) / 2));
      recalculatePrice(location.id, id);
    }
  }

  for (const [resourceId, amount] of Object.entries(offer.offered)) {
    if (resourceId !== 'credits' && isGoodId(resourceId as ResourceId)) {
      const id = resourceId as GoodId;
      marketStocks[location.id][id] += Math.floor((amount ?? 0) / 2);
      recalculatePrice(location.id, id);
    }
  }
}

function applyRelationshipChange(factionId: FactionId, result: NegotiationResult): void {
  const delta = relationshipDeltaAfterTrade(result);
  factionStates[factionId].relationshipWithPlayer += delta.relationshipWithPlayer;
  factionStates[factionId].trust += delta.trust;
}

function executeCommand(command: string): void {
  const parts = command.trim().toLowerCase().split(/\s+/);
  const action = parts[0];

  if (!action) return;

  if (action !== 'clear') {
    log(`> ${command}`);
  }

  if (action === 'status') {
    showStatus();
  } else if (action === 'market') {
    showMarket();
  } else if (action === 'buy') {
    buy(parts[1], parts[2]);
  } else if (action === 'sell') {
    sell(parts[1], parts[2]);
  } else if (action === 'travel') {
    travel(parts[1]);
  } else if (action === 'bargain') {
    showBargainingHelp();
  } else if (action === 'offer' || action === 'negotiate' || action === 'trade') {
    void submitFreeformBargainingMessage(command);
  } else if (action === 'clear') {
    logEl.innerHTML = '';
  } else {
    void submitFreeformBargainingMessage(command);
  }

  render();
}

manualForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const command = manualInput.value;
  manualInput.value = '';

  executeCommand(command);
});

log('You wake in the cargo bay of a small merchant ship.');
log('The docking lights of Vega Station flicker beyond the viewport.');
log('Choose a command below, or type one manually.');

render();
