import './style.css';

type GoodId =
  | 'medicine'
  | 'ore'
  | 'star_silk'
  | 'alien_relics';

type LocationId = 'vega' | 'sirius' | 'nova7';
type SupplyId = 'food' | 'water' | 'fuel';

type AllianceStatus = 'none' | 'trade_pact' | 'alliance';

type Good = {
  id: GoodId;
  name: string;
};

type Supply = {
  id: SupplyId;
  name: string;
  warning: number;
};

type Location = {
  id: LocationId;
  name: string;
  description: string;
  supplyPrices: Record<SupplyId, number>;
  prices: Record<GoodId, number>;
  routes: Partial<Record<LocationId, number>>;
};

type Player = {
  day: number;
  credits: number;
  locationId: LocationId;
  cargoCapacity: number;
  supplies: Record<SupplyId, number>;
  cargo: Partial<Record<GoodId, number>>;
};

type DiplomacyState = {
  relationship: number;
  alliance: AllianceStatus;
};

type EventChoice = {
  command: string;
  label: string;
  effect: () => void;
};

type PendingEvent = {
  title: string;
  description: string;
  options: EventChoice[];
};

const goods: Record<GoodId, Good> = {
  medicine: { id: 'medicine', name: 'Medicine' },
  ore: { id: 'ore', name: 'Ore' },
  star_silk: { id: 'star_silk', name: 'Star Silk' },
  alien_relics: { id: 'alien_relics', name: 'Alien Relics' },
};

const supplies: Record<SupplyId, Supply> = {
  food: { id: 'food', name: 'Food', warning: 2 },
  water: { id: 'water', name: 'Water', warning: 2 },
  fuel: { id: 'fuel', name: 'Fuel', warning: 8 },
};

const locations: Record<LocationId, Location> = {
  vega: {
    id: 'vega',
    name: 'Vega Station',
    description: 'A polished trade hub orbiting a blue-white star.',
    supplyPrices: {
      food: 10,
      water: 8,
      fuel: 6,
    },
    prices: {
      medicine: 95,
      ore: 35,
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
    supplyPrices: {
      food: 14,
      water: 12,
      fuel: 8,
    },
    prices: {
      medicine: 120,
      ore: 20,
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
    supplyPrices: {
      food: 18,
      water: 16,
      fuel: 10,
    },
    prices: {
      medicine: 155,
      ore: 28,
      star_silk: 240,
      alien_relics: 700,
    },
    routes: {
      vega: 30,
      sirius: 20,
    },
  },
};

const player: Player = {
  day: 1,
  credits: 1200,
  locationId: 'vega',
  cargoCapacity: 30,
  supplies: {
    food: 10,
    water: 10,
    fuel: 70,
  },
  cargo: {},
};

const diplomacy: Record<LocationId, DiplomacyState> = {
  vega: {
    relationship: 35,
    alliance: 'trade_pact',
  },
  sirius: {
    relationship: 8,
    alliance: 'none',
  },
  nova7: {
    relationship: 22,
    alliance: 'none',
  },
};

const locationIds = Object.keys(locations) as LocationId[];

let gameOver = false;
let gameOverReason = '';
let pendingEvent: PendingEvent | null = null;

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App element not found');
}

app.innerHTML = `
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
          <h2>INVENTORY</h2>
          <div id="inventory"></div>
        </section>

        <section class="era-box">
          <h2>MARKET</h2>
          <div id="market"></div>
        </section>

        <section class="era-box">
          <h2>DIPLOMACY</h2>
          <div id="diplomacy"></div>
        </section>
      </aside>
    </main>

    <footer class="era-command-area">
      <div class="era-command-title">COMMAND</div>
      <div id="commands" class="era-command-grid"></div>

      <form id="manual-form" class="manual-form">
        <span>&gt;</span>
        <input id="manual-input" placeholder="type command, e.g. buy ore 2, resupply water 3, gift 120" autocomplete="off" />
      </form>
    </footer>
  </div>
`;

const logEl = document.querySelector<HTMLDivElement>('#log')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const inventoryEl = document.querySelector<HTMLDivElement>('#inventory')!;
const marketEl = document.querySelector<HTMLDivElement>('#market')!;
const diplomacyEl = document.querySelector<HTMLDivElement>('#diplomacy')!;
const commandsEl = document.querySelector<HTMLDivElement>('#commands')!;
const headerLocationEl = document.querySelector<HTMLDivElement>('#header-location')!;
const headerDayEl = document.querySelector<HTMLDivElement>('#header-day')!;
const manualForm = document.querySelector<HTMLFormElement>('#manual-form')!;
const manualInput = document.querySelector<HTMLInputElement>('#manual-input')!;

function currentLocation(): Location {
  return locations[player.locationId];
}

function currentDiplomacy(): DiplomacyState {
  return diplomacy[player.locationId];
}

function locationName(locationId: LocationId): string {
  return locations[locationId].name;
}

function cargoUsed(): number {
  return Object.values(player.cargo).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomLocation(exclude: LocationId[] = []): LocationId {
  return randomPick(locationIds.filter((locationId) => !exclude.includes(locationId)));
}

function randomLocationPair(): [LocationId, LocationId] {
  const first = randomLocation();
  const second = randomLocation([first]);
  return [first, second];
}

function countAlliances(status: AllianceStatus): number {
  return Object.values(diplomacy).filter((entry) => entry.alliance === status).length;
}

function relationshipTier(relationship: number): string {
  if (relationship <= -50) return 'Hostile';
  if (relationship < -10) return 'Cold';
  if (relationship <= 10) return 'Mixed Opinion';
  if (relationship <= 50) return 'Friendly';
  if (relationship <= 80) return 'Trusted Partner';
  return 'Alliance Ready';
}

function allianceLabel(status: AllianceStatus): string {
  if (status === 'trade_pact') return 'Trade Pact';
  if (status === 'alliance') return 'Alliance Contract';
  return 'No Pact';
}

function adjustRelationship(locationId: LocationId, change: number): void {
  diplomacy[locationId].relationship = Math.max(
    -100,
    Math.min(100, diplomacy[locationId].relationship + change)
  );
}

function buyMultiplier(state: DiplomacyState): number {
  let modifier = 1;

  if (state.relationship >= 80) modifier -= 0.12;
  else if (state.relationship >= 50) modifier -= 0.08;
  else if (state.relationship > 10) modifier -= 0.04;
  else if (state.relationship < -40) modifier += 0.16;
  else if (state.relationship < -10) modifier += 0.08;

  if (state.alliance === 'trade_pact') modifier -= 0.05;
  if (state.alliance === 'alliance') modifier -= 0.1;

  return Math.max(0.55, modifier);
}

function sellMultiplier(state: DiplomacyState): number {
  let modifier = 1;

  if (state.relationship >= 80) modifier += 0.12;
  else if (state.relationship >= 50) modifier += 0.08;
  else if (state.relationship > 10) modifier += 0.04;
  else if (state.relationship < -40) modifier -= 0.16;
  else if (state.relationship < -10) modifier -= 0.08;

  if (state.alliance === 'trade_pact') modifier += 0.05;
  if (state.alliance === 'alliance') modifier += 0.1;

  return Math.max(0.55, modifier);
}

function adjustedBuyPrice(locationId: LocationId, goodId: GoodId): number {
  const basePrice = locations[locationId].prices[goodId];
  return Math.max(1, Math.round(basePrice * buyMultiplier(diplomacy[locationId])));
}

function adjustedSellPrice(locationId: LocationId, goodId: GoodId): number {
  const basePrice = locations[locationId].prices[goodId];
  return Math.max(1, Math.round(basePrice * sellMultiplier(diplomacy[locationId])));
}

function incomePerTurn(): number {
  return 120 + countAlliances('trade_pact') * 25 + countAlliances('alliance') * 60;
}

function loseCredits(amount: number): number {
  const actual = Math.min(player.credits, amount);
  player.credits -= actual;
  return actual;
}

function loseSupply(supplyId: SupplyId, amount: number): number {
  const actual = Math.min(player.supplies[supplyId], amount);
  player.supplies[supplyId] -= actual;
  return actual;
}

function gainSupply(supplyId: SupplyId, amount: number): void {
  player.supplies[supplyId] += amount;
}

function gainCargo(goodId: GoodId, amount: number): void {
  player.cargo[goodId] = (player.cargo[goodId] ?? 0) + amount;
}

function checkGameOver(): void {
  if (gameOver) return;

  for (const supply of Object.values(supplies)) {
    if (player.supplies[supply.id] < supply.warning) {
      gameOver = true;
      gameOverReason = `${supply.name} fell below the safe reserve line (${supply.warning}).`;
      log(`GAME OVER\n${gameOverReason}`);
      return;
    }
  }
}

function consumeSupplies(): void {
  player.supplies.food = Math.max(0, player.supplies.food - 2);
  player.supplies.water = Math.max(0, player.supplies.water - 2);
  player.supplies.fuel = Math.max(0, player.supplies.fuel - 1);
}

function createBorderSkirmishEvent(): PendingEvent {
  const [first, second] = randomLocationPair();

  return {
    title: 'NEUTRAL EVENT - BORDER SKIRMISH',
    description: `${locationName(first)} and ${locationName(second)} report open fighting between convoy escorts. Choose a side or stay clear.`,
    options: [
      {
        command: `support ${first}`,
        label: `Support ${locationName(first)}`,
        effect: () => {
          const fee = loseCredits(90);
          adjustRelationship(first, 14);
          adjustRelationship(second, -12);
          log(
            `You back ${locationName(first)} with ${fee} credits in security aid.\nRelationship shifts in their favor while ${locationName(second)} resents your decision.`
          );
        },
      },
      {
        command: `support ${second}`,
        label: `Support ${locationName(second)}`,
        effect: () => {
          const fee = loseCredits(90);
          adjustRelationship(second, 14);
          adjustRelationship(first, -12);
          log(
            `You back ${locationName(second)} with ${fee} credits in security aid.\nRelationship shifts in their favor while ${locationName(first)} resents your decision.`
          );
        },
      },
      {
        command: 'support none',
        label: 'Remain Neutral',
        effect: () => {
          adjustRelationship(first, -2);
          adjustRelationship(second, -2);
          log(
            `You refuse to intervene in the border skirmish.\nBoth sides mark your ship as cautious and uncommitted.`
          );
        },
      },
    ],
  };
}

function createDockUnionEvent(): PendingEvent {
  const [first, second] = randomLocationPair();

  return {
    title: 'NEUTRAL EVENT - DOCK UNION DISPUTE',
    description: `Dock unions from ${locationName(first)} accuse brokers from ${locationName(second)} of undercutting wages. Your testimony is requested.`,
    options: [
      {
        command: `endorse ${first}`,
        label: `Endorse ${locationName(first)}`,
        effect: () => {
          adjustRelationship(first, 12);
          adjustRelationship(second, -10);
          gainSupply('food', 2);
          log(
            `You side with the dock crews of ${locationName(first)}.\nThey repay you with fresh food stores, while ${locationName(second)} lowers its opinion of you.`
          );
        },
      },
      {
        command: `endorse ${second}`,
        label: `Endorse ${locationName(second)}`,
        effect: () => {
          adjustRelationship(second, 12);
          adjustRelationship(first, -10);
          player.credits += 80;
          log(
            `You endorse the brokers of ${locationName(second)}.\nThey reward you with a quick payment, and ${locationName(first)} takes offense.`
          );
        },
      },
      {
        command: 'endorse none',
        label: 'Decline Involvement',
        effect: () => {
          adjustRelationship(first, 1);
          adjustRelationship(second, 1);
          log(
            `You decline to testify and offer only safe transport advice.\nBoth sides appreciate your restraint, though no one owes you a favor.`
          );
        },
      },
    ],
  };
}

function createRefugeeFlotillaEvent(): PendingEvent {
  const [first, second] = randomLocationPair();

  return {
    title: 'NEUTRAL EVENT - REFUGEE FLOTILLA',
    description: `A refugee flotilla is drifting between ${locationName(first)} and ${locationName(second)}. Both ports ask where your convoy support should go.`,
    options: [
      {
        command: `aid ${first}`,
        label: `Escort To ${locationName(first)}`,
        effect: () => {
          loseSupply('fuel', 6);
          adjustRelationship(first, 16);
          adjustRelationship(second, -6);
          log(
            `You burn extra fuel escorting the flotilla to ${locationName(first)}.\nThey are grateful, while ${locationName(second)} feels ignored.`
          );
        },
      },
      {
        command: `aid ${second}`,
        label: `Escort To ${locationName(second)}`,
        effect: () => {
          loseSupply('fuel', 6);
          adjustRelationship(second, 16);
          adjustRelationship(first, -6);
          log(
            `You burn extra fuel escorting the flotilla to ${locationName(second)}.\nThey are grateful, while ${locationName(first)} feels ignored.`
          );
        },
      },
      {
        command: 'aid none',
        label: 'Decline Escort Duty',
        effect: () => {
          loseCredits(40);
          adjustRelationship(first, -5);
          adjustRelationship(second, -5);
          log(
            `You refuse escort duty and only transmit a warning beacon.\nThe refugees drift onward, and both ports judge you harshly.`
          );
        },
      },
    ],
  };
}

function runGoodEvent(): void {
  const goodEvents = [
    () => {
      const locationId = randomLocation();
      player.credits += 180;
      adjustRelationship(locationId, 8);
      log(
        `GOOD EVENT - SALVAGE BEACON\nA drifting salvage beacon leads you to intact cargo ledgers.\nYou gain 180 credits and ${locationName(locationId)} hears of your honest reporting.`
      );
    },
    () => {
      gainSupply('food', 3);
      gainSupply('water', 3);
      gainSupply('fuel', 8);
      log(
        'GOOD EVENT - RELIEF CONVOY\nA relief convoy tops up your essentials.\nYou gain food +3, water +3, and fuel +8.'
      );
    },
    () => {
      const goodId = randomPick(Object.keys(goods) as GoodId[]);
      gainCargo(goodId, 2);
      player.credits += 70;
      log(
        `GOOD EVENT - FESTIVAL CHARTER\nA local festival hires your ship for ceremonial hauling.\nYou gain 70 credits and 2 units of ${goods[goodId].name}.`
      );
    },
  ];

  randomPick(goodEvents)();
}

function runBadEvent(): void {
  const badEvents = [
    () => {
      const foodLost = loseSupply('food', 2);
      const waterLost = loseSupply('water', 3);
      log(
        `BAD EVENT - HULL BREACH\nA micrometeor breach spoils your stores.\nYou lose food ${foodLost} and water ${waterLost}.`
      );
    },
    () => {
      const creditsLost = loseCredits(160);
      log(
        `BAD EVENT - PIRATE TOLL\nRaiders extort your ship in a shipping lane checkpoint.\nYou lose ${creditsLost} credits.`
      );
    },
    () => {
      const fuelLost = loseSupply('fuel', 10);
      const locationId = randomLocation();
      adjustRelationship(locationId, -8);
      log(
        `BAD EVENT - FUEL MANIFOLD FRACTURE\nA cracked fuel line vents ${fuelLost} fuel.\nYour delayed delivery also irritates contacts at ${locationName(locationId)}.`
      );
    },
  ];

  randomPick(badEvents)();
}

function prepareNeutralEvent(): void {
  const neutralEvents = [
    createBorderSkirmishEvent,
    createDockUnionEvent,
    createRefugeeFlotillaEvent,
  ];

  pendingEvent = randomPick(neutralEvents)();
  log(
    `${pendingEvent.title}\n${pendingEvent.description}\nChoices:\n${pendingEvent.options
      .map((option) => `- ${option.label} [${option.command}]`)
      .join('\n')}`
  );
}

function maybeTriggerRandomEvent(): void {
  if (gameOver) return;

  pendingEvent = null;

  if (Math.random() >= 0.5) {
    log('ROUND EVENT\nThe shipping lanes stay quiet this round.');
    return;
  }

  const eventType = randomPick(['good', 'bad', 'neutral'] as const);

  if (eventType === 'good') {
    runGoodEvent();
  } else if (eventType === 'bad') {
    runBadEvent();
  } else {
    prepareNeutralEvent();
  }

  checkGameOver();
}

function advanceTurn(summary: string): void {
  if (gameOver) return;

  player.day += 1;
  const income = incomePerTurn();
  player.credits += income;
  consumeSupplies();

  log(
    `${summary}\nTurn income: ${income} credits.\nSupplies consumed: food -2, water -2, fuel -1.`
  );

  maybeTriggerRandomEvent();
  checkGameOver();
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
  const locationDiplomacy = currentDiplomacy();

  headerLocationEl.textContent = location.name;
  headerDayEl.textContent = gameOver ? 'GAME OVER' : `DAY ${player.day}`;

  statusEl.innerHTML = `
    <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
    <div class="stat-row"><span>Turn Income</span><strong>${incomePerTurn()}</strong></div>
    <div class="stat-row"><span>Location</span><strong>${location.name}</strong></div>
    <div class="stat-row"><span>Relationship</span><strong>${locationDiplomacy.relationship}</strong></div>
    <div class="stat-row"><span>Cargo</span><strong>${cargoUsed()} / ${player.cargoCapacity}</strong></div>
  `;

  const supplyRows = Object.values(supplies)
    .map((supply) => {
      const amount = player.supplies[supply.id];
      const critical = amount < supply.warning ? ' danger' : '';
      return `<div class="stat-row${critical}"><span>${supply.name}</span><strong>${amount} / min ${supply.warning}</strong></div>`;
    })
    .join('');

  const cargoEntries = Object.entries(player.cargo)
    .map(([goodId, amount]) => {
      const good = goods[goodId as GoodId];
      return `<div class="stat-row"><span>${good.name}</span><strong>${amount}</strong></div>`;
    })
    .join('');

  inventoryEl.innerHTML = `
    <div class="box-subtitle">ESSENTIAL SUPPLIES</div>
    ${supplyRows}
    <div class="box-subtitle inventory-separator">TRADE CARGO</div>
    ${cargoEntries || `<div class="muted">Empty cargo hold</div>`}
  `;

  const supplyMarketRows = Object.values(supplies)
    .map((supply) => {
      const price = location.supplyPrices[supply.id];
      return `<div class="stat-row"><span>${supply.name}</span><strong>${price}</strong></div>`;
    })
    .join('');

  const cargoMarketRows = Object.values(goods)
    .map((good) => {
      const buyPrice = adjustedBuyPrice(location.id, good.id);
      const sellPrice = adjustedSellPrice(location.id, good.id);
      return `<div class="stat-row"><span>${good.name}</span><strong>B ${buyPrice} | S ${sellPrice}</strong></div>`;
    })
    .join('');

  marketEl.innerHTML = `
    <div class="box-subtitle">SUPPLIES</div>
    ${supplyMarketRows}
    <div class="box-subtitle inventory-separator">TRADE GOODS</div>
    ${cargoMarketRows}
  `;

  diplomacyEl.innerHTML = `
    <div class="stat-row"><span>Relationship</span><strong>${locationDiplomacy.relationship}</strong></div>
    <div class="stat-row"><span>Tier</span><strong>${relationshipTier(locationDiplomacy.relationship)}</strong></div>
    <div class="stat-row"><span>Alliance</span><strong>${allianceLabel(locationDiplomacy.alliance)}</strong></div>
  `;

  renderCommands();

  manualInput.disabled = gameOver;
  manualInput.placeholder = gameOver
    ? 'game over'
    : 'type command, e.g. buy ore 2, resupply water 3, gift 120';
}

function renderCommands(): void {
  if (gameOver) {
    commandsEl.innerHTML = `<div class="game-over-box">GAME OVER: ${gameOverReason}</div>`;
    return;
  }

  if (pendingEvent) {
    let index = 1;
    const eventButtons = [
      ...pendingEvent.options.map((option) => ({
        label: option.label,
        command: option.command,
      })),
      { label: 'Status', command: 'status' },
      { label: 'Relations', command: 'relations' },
      { label: 'Clear Log', command: 'clear' },
    ];

    commandsEl.innerHTML = eventButtons
      .map((button) => {
        const number = index++;
        return `
          <button class="command-button event-command-button" data-command="${button.command}">
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

    return;
  }

  const location = currentLocation();
  let index = 1;

  const commandButtons: { label: string; command: string }[] = [
    { label: 'Status', command: 'status' },
    { label: 'Market', command: 'market' },
    { label: 'Relations', command: 'relations' },
    { label: 'Buy Food', command: 'resupply food 3' },
    { label: 'Buy Water', command: 'resupply water 3' },
    { label: 'Refuel', command: 'resupply fuel 12' },
    { label: 'Buy Ore', command: 'buy ore 1' },
    { label: 'Buy Medicine', command: 'buy medicine 1' },
    { label: 'Sell Ore', command: 'sell ore 1' },
    { label: 'Sell Medicine', command: 'sell medicine 1' },
    { label: 'Gift 100 Credits', command: 'gift 100' },
  ];

  const locationDiplomacy = currentDiplomacy();

  if (locationDiplomacy.alliance === 'none') {
    commandButtons.push({ label: 'Request Trade Pact', command: 'pact' });
  } else if (locationDiplomacy.alliance === 'trade_pact') {
    commandButtons.push({ label: 'Request Alliance', command: 'alliance' });
  }

  for (const [destinationId, fuelCost] of Object.entries(location.routes)) {
    const destination = locations[destinationId as LocationId];
    commandButtons.push({
      label: `Travel ${destination.name} (${fuelCost} fuel)`,
      command: `travel ${destinationId}`,
    });
  }

  commandButtons.push({ label: 'End Turn', command: 'end' });
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

function showStatus(): void {
  const location = currentLocation();
  const locationDiplomacy = currentDiplomacy();

  log(
    `STATUS
Credits: ${player.credits}
Turn income: ${incomePerTurn()}
Location: ${location.name}
Relationship: ${locationDiplomacy.relationship} (${relationshipTier(locationDiplomacy.relationship)})
Alliance: ${allianceLabel(locationDiplomacy.alliance)}
Food: ${player.supplies.food}
Water: ${player.supplies.water}
Fuel: ${player.supplies.fuel}
Cargo: ${cargoUsed()} / ${player.cargoCapacity}`
  );
}

function showMarket(): void {
  const location = currentLocation();

  const supplyLines = Object.values(supplies)
    .map((supply) => `${supply.name.padEnd(14)} ${location.supplyPrices[supply.id]} credits`)
    .join('\n');

  const cargoLines = Object.values(goods)
    .map((good) => {
      const buyPrice = adjustedBuyPrice(location.id, good.id);
      const sellPrice = adjustedSellPrice(location.id, good.id);
      return `${good.name.padEnd(14)} buy ${String(buyPrice).padEnd(4)} sell ${sellPrice}`;
    })
    .join('\n');

  log(`MARKET - ${location.name}\nSUPPLIES\n${supplyLines}\nTRADE GOODS\n${cargoLines}`);
}

function showRelations(): void {
  const location = currentLocation();
  const locationDiplomacy = currentDiplomacy();

  log(
    `RELATIONS - ${location.name}
Relationship: ${locationDiplomacy.relationship}
Tier: ${relationshipTier(locationDiplomacy.relationship)}
Alliance: ${allianceLabel(locationDiplomacy.alliance)}`
  );
}

function resupply(supplyId: string, amountText: string): void {
  const supply = supplies[supplyId as SupplyId];
  const amount = Number(amountText);
  const location = currentLocation();

  if (!supply || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid resupply. Example: resupply water 3');
    return;
  }

  const totalCost = location.supplyPrices[supply.id] * amount;

  if (player.credits < totalCost) {
    log(`Not enough credits. Need ${totalCost} credits.`);
    return;
  }

  player.credits -= totalCost;
  player.supplies[supply.id] += amount;

  log(`Resupplied ${amount} ${supply.name} for ${totalCost} credits.`);
}

function buy(goodId: string, amountText: string): void {
  const good = goods[goodId as GoodId];
  const amount = Number(amountText);

  if (!good || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid purchase. Example: buy water 3');
    return;
  }

  const location = currentLocation();
  const unitPrice = adjustedBuyPrice(location.id, good.id);
  const totalCost = unitPrice * amount;

  if (player.credits < totalCost) {
    log(`Not enough credits. Need ${totalCost} credits.`);
    return;
  }

  if (cargoUsed() + amount > player.cargoCapacity) {
    log('Not enough cargo space.');
    return;
  }

  player.credits -= totalCost;
  player.cargo[good.id] = (player.cargo[good.id] ?? 0) + amount;
  adjustRelationship(location.id, 1);

  log(
    `Bought ${amount} ${good.name} for ${totalCost} credits.\nRelationship with ${location.name} improved slightly.`
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
  const unitPrice = adjustedSellPrice(location.id, good.id);
  const earned = unitPrice * amount;
  const relationshipGain = location.prices[good.id] >= 100 ? 2 : 1;

  player.credits += earned;
  player.cargo[good.id] = owned - amount;
  adjustRelationship(location.id, relationshipGain);

  if (player.cargo[good.id] === 0) {
    delete player.cargo[good.id];
  }

  log(
    `Sold ${amount} ${good.name} for ${earned} credits.\nRelationship with ${location.name} improved by ${relationshipGain}.`
  );
}

function gift(amountText: string): void {
  const amount = Number(amountText);
  const location = currentLocation();

  if (!Number.isInteger(amount) || amount <= 0) {
    log('Invalid gift. Example: gift 120');
    return;
  }

  if (player.credits < amount) {
    log(`Not enough credits. Need ${amount} credits.`);
    return;
  }

  player.credits -= amount;

  const relationshipGain = Math.max(2, Math.min(18, Math.floor(amount / 30)));
  adjustRelationship(location.id, relationshipGain);

  log(
    `You send a ${amount}-credit gift package to ${location.name}.\nRelationship improved by ${relationshipGain}.`
  );
}

function requestTradePact(): void {
  const location = currentLocation();
  const locationDiplomacy = currentDiplomacy();
  const fee = 140;

  if (locationDiplomacy.alliance !== 'none') {
    log(`${location.name} already has a formal trade arrangement with you.`);
    return;
  }

  if (locationDiplomacy.relationship < 35) {
    log(`Relationship is too low for a trade pact. Reach at least 35 first.`);
    return;
  }

  if (player.credits < fee) {
    log(`Not enough credits. Need ${fee} credits for registry fees.`);
    return;
  }

  player.credits -= fee;
  locationDiplomacy.alliance = 'trade_pact';
  adjustRelationship(location.id, 10);

  log(
    `${location.name} signs a trade pact with your ship.\nYou now receive better standing prices at this port.`
  );
}

function requestAlliance(): void {
  const location = currentLocation();
  const locationDiplomacy = currentDiplomacy();
  const fee = 240;

  if (locationDiplomacy.alliance === 'alliance') {
    log(`${location.name} is already bound to you by an alliance contract.`);
    return;
  }

  if (locationDiplomacy.alliance !== 'trade_pact') {
    log(`You need a trade pact before requesting a full alliance.`);
    return;
  }

  if (locationDiplomacy.relationship < 75) {
    log(`Relationship is too low for an alliance. Reach at least 75 first.`);
    return;
  }

  if (player.credits < fee) {
    log(`Not enough credits. Need ${fee} credits for alliance guarantees.`);
    return;
  }

  player.credits -= fee;
  locationDiplomacy.alliance = 'alliance';
  adjustRelationship(location.id, 8);

  log(
    `${location.name} accepts an alliance contract.\nYour trade reputation and local pricing both improve here.`
  );
}

function resolvePendingEvent(command: string): boolean {
  if (!pendingEvent) return false;

  const option = pendingEvent.options.find((choice) => choice.command === command);

  if (!option) {
    log('This event requires one of the listed choices before normal operations can resume.');
    return true;
  }

  option.effect();
  pendingEvent = null;
  checkGameOver();
  return true;
}

function travel(destinationId: string): void {
  const location = currentLocation();
  const destination = locations[destinationId as LocationId];
  const fuelCost = location.routes[destinationId as LocationId];

  if (!destination || fuelCost === undefined) {
    log('Unknown route.');
    return;
  }

  if (player.supplies.fuel < fuelCost) {
    log(`Not enough fuel. Need ${fuelCost} fuel.`);
    return;
  }

  player.supplies.fuel -= fuelCost;
  player.locationId = destination.id;

  const destinationDiplomacy = diplomacy[destination.id];

  advanceTurn(
    `You travel to ${destination.name}.\n${destination.description}\nRelationship: ${destinationDiplomacy.relationship} (${relationshipTier(destinationDiplomacy.relationship)}).`
  );
}

function endTurn(): void {
  const location = currentLocation();
  advanceTurn(`You remain docked at ${location.name} and collect routine contract payouts.`);
}

function executeCommand(command: string): void {
  if (gameOver) return;

  const normalizedCommand = command.trim().toLowerCase();
  const parts = normalizedCommand.split(/\s+/);
  const action = parts[0];

  if (!action) return;

  if (action !== 'clear') {
    log(`> ${command}`);
  }

  if (pendingEvent && !['status', 'relations', 'clear'].includes(action)) {
    resolvePendingEvent(normalizedCommand);
    render();
    return;
  }

  if (action === 'status') {
    showStatus();
  } else if (action === 'market') {
    showMarket();
  } else if (action === 'relations') {
    showRelations();
  } else if (action === 'resupply') {
    resupply(parts[1], parts[2]);
  } else if (action === 'buy') {
    buy(parts[1], parts[2]);
  } else if (action === 'sell') {
    sell(parts[1], parts[2]);
  } else if (action === 'gift') {
    gift(parts[1]);
  } else if (action === 'pact') {
    requestTradePact();
  } else if (action === 'alliance') {
    requestAlliance();
  } else if (action === 'travel') {
    travel(parts[1]);
  } else if (action === 'end') {
    endTurn();
  } else if (action === 'clear') {
    logEl.innerHTML = '';
  } else {
    log(`Unknown command: ${command}`);
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
log('Ports track their relationship with you, and alliances improve market prices.');
log('Each turn awards credits only. Keep food, water, and fuel above their reserve lines.');
log('At the start of each round, there is a 50% chance that a random event enters the shipping lanes.');
log('Choose a command below, or type one manually.');

render();
