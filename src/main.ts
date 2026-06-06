import './style.css';
import bargainingFactions from './data/factions.json';
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
  Faction as BargainFaction,
  FactionId as BargainFactionId,
  NegotiationOffer,
  NegotiationResult,
  ResourceBundle,
  ResourceId,
} from './game/negotiation';
import type { Inventory as BargainInventory } from './game/trade';

type GoodId = 'medicine' | 'ore' | 'star_silk' | 'alien_relics';
type SupplyId = 'food' | 'water' | 'fuel';
type TradeItemId = GoodId | SupplyId;
type LocationId = 'vega' | 'sirius' | 'nova7';
type FactionId =
  | 'vega_exchange'
  | 'sirius_guild'
  | 'nova_relief'
  | 'free_caravans'
  | 'dust_runners';
type AllianceStatus = 'none' | 'trade_pact' | 'alliance';
type FactionStance = 'ally' | 'friendly' | 'neutral' | 'rival' | 'hostile';
type SidebarTab = 'market' | 'ledger' | 'bargain';

type Good = {
  id: GoodId;
  name: string;
};

type Supply = {
  id: SupplyId;
  name: string;
  warning: number;
};

type VendorOffer = {
  itemId: TradeItemId;
  kind: 'supply' | 'good';
  ask: number;
  bid?: number;
};

type Vendor = {
  id: string;
  name: string;
  role: string;
  factionId: FactionId;
  bio: string;
  stock: VendorOffer[];
};

type Location = {
  id: LocationId;
  name: string;
  description: string;
  governingFaction: FactionId;
  routes: Partial<Record<LocationId, number>>;
  vendors: Vendor[];
};

type Player = {
  day: number;
  credits: number;
  locationId: LocationId;
  cargoCapacity: number;
  supplies: Record<SupplyId, number>;
  cargo: Partial<Record<GoodId, number>>;
};

type Faction = {
  id: FactionId;
  name: string;
  identity: string;
  home: string;
};

type DiplomacyState = {
  relationship: number;
  alliance: AllianceStatus;
};

type RippleEntry = {
  factionId: FactionId;
  change: number;
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

type MarketSpecial = {
  vendorId: string;
  itemId: TradeItemId;
  type: 'discount' | 'buyback';
  description: string;
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

const factions: Record<FactionId, Faction> = {
  vega_exchange: {
    id: 'vega_exchange',
    name: 'Vega Exchange Authority',
    identity: 'Banking blocs, licensed brokers, and dock registrars.',
    home: 'Vega Station',
  },
  sirius_guild: {
    id: 'sirius_guild',
    name: 'Sirius Mining Guild',
    identity: 'Ore barons, refinery supervisors, and extraction crews.',
    home: 'Sirius Outpost',
  },
  nova_relief: {
    id: 'nova_relief',
    name: 'Nova Relief Collective',
    identity: 'Supply stewards, medics, and colony quartermasters.',
    home: 'Nova-7 Colony',
  },
  free_caravans: {
    id: 'free_caravans',
    name: 'Free Caravans Syndicate',
    identity: 'Luxury haulers, route fixers, and roaming trade families.',
    home: 'Deep convoy routes',
  },
  dust_runners: {
    id: 'dust_runners',
    name: 'Dust Runner Clans',
    identity: 'Scrappers, smugglers, and dangerous edge-route captains.',
    home: 'Unregistered frontier docks',
  },
};

const factionLinks: Record<FactionId, Partial<Record<FactionId, FactionStance>>> = {
  vega_exchange: {
    sirius_guild: 'friendly',
    nova_relief: 'ally',
    free_caravans: 'friendly',
    dust_runners: 'rival',
  },
  sirius_guild: {
    vega_exchange: 'friendly',
    nova_relief: 'rival',
    free_caravans: 'neutral',
    dust_runners: 'hostile',
  },
  nova_relief: {
    vega_exchange: 'ally',
    sirius_guild: 'rival',
    free_caravans: 'friendly',
    dust_runners: 'hostile',
  },
  free_caravans: {
    vega_exchange: 'friendly',
    sirius_guild: 'neutral',
    nova_relief: 'friendly',
    dust_runners: 'rival',
  },
  dust_runners: {
    vega_exchange: 'rival',
    sirius_guild: 'hostile',
    nova_relief: 'hostile',
    free_caravans: 'rival',
  },
};

const locations: Record<LocationId, Location> = {
  vega: {
    id: 'vega',
    name: 'Vega Station',
    description: 'A polished trade hub orbiting a blue-white star.',
    governingFaction: 'vega_exchange',
    routes: {
      sirius: 15,
      nova7: 30,
    },
    vendors: [
      {
        id: 'vega-orlan',
        name: 'Rhea Orlan',
        role: 'Dock Quartermaster',
        factionId: 'vega_exchange',
        bio: 'Runs ration locks, manifests, and certified fuel tenders.',
        stock: [
          { itemId: 'food', kind: 'supply', ask: 10 },
          { itemId: 'water', kind: 'supply', ask: 8 },
          { itemId: 'fuel', kind: 'supply', ask: 6 },
          { itemId: 'medicine', kind: 'good', ask: 108, bid: 74 },
        ],
      },
      {
        id: 'vega-vanto',
        name: 'Elys Vanto',
        role: 'Luxury Cargo Curator',
        factionId: 'free_caravans',
        bio: 'Specializes in high-margin fabrics, relic lots, and quiet patrons.',
        stock: [
          { itemId: 'star_silk', kind: 'good', ask: 236, bid: 168 },
          { itemId: 'alien_relics', kind: 'good', ask: 560, bid: 430 },
          { itemId: 'medicine', kind: 'good', ask: 118, bid: 82 },
        ],
      },
      {
        id: 'vega-brass',
        name: 'Tom Brass',
        role: 'Hull Recycler',
        factionId: 'dust_runners',
        bio: 'Sells patched metal and listens for the wrong kind of opportunity.',
        stock: [
          { itemId: 'ore', kind: 'good', ask: 46, bid: 28 },
          { itemId: 'fuel', kind: 'supply', ask: 7 },
          { itemId: 'star_silk', kind: 'good', ask: 248, bid: 154 },
        ],
      },
    ],
  },
  sirius: {
    id: 'sirius',
    name: 'Sirius Outpost',
    description: 'A mining colony with cheap ore and nervous guards.',
    governingFaction: 'sirius_guild',
    routes: {
      vega: 15,
      nova7: 20,
    },
    vendors: [
      {
        id: 'sirius-dane',
        name: 'Foreman Dane Korr',
        role: 'Mine Contract Broker',
        factionId: 'sirius_guild',
        bio: 'Moves raw ore, industrial drill heads, and grudges by the ton.',
        stock: [
          { itemId: 'ore', kind: 'good', ask: 26, bid: 18 },
          { itemId: 'fuel', kind: 'supply', ask: 8 },
          { itemId: 'food', kind: 'supply', ask: 15 },
        ],
      },
      {
        id: 'sirius-hale',
        name: 'Dr. Sen Hale',
        role: 'Field Surgeon',
        factionId: 'nova_relief',
        bio: 'Trades vaccines, trauma kits, and practical advice.',
        stock: [
          { itemId: 'medicine', kind: 'good', ask: 138, bid: 102 },
          { itemId: 'water', kind: 'supply', ask: 12 },
          { itemId: 'food', kind: 'supply', ask: 14 },
        ],
      },
      {
        id: 'sirius-kade',
        name: 'Kade Wormlight',
        role: 'Black Route Smuggler',
        factionId: 'dust_runners',
        bio: 'Shows up late, armed, and somehow still profitable.',
        stock: [
          { itemId: 'alien_relics', kind: 'good', ask: 690, bid: 530 },
          { itemId: 'star_silk', kind: 'good', ask: 292, bid: 214 },
          { itemId: 'fuel', kind: 'supply', ask: 10 },
        ],
      },
    ],
  },
  nova7: {
    id: 'nova7',
    name: 'Nova-7 Colony',
    description: 'A frontier colony always short on supplies.',
    governingFaction: 'nova_relief',
    routes: {
      vega: 30,
      sirius: 20,
    },
    vendors: [
      {
        id: 'nova-ilo',
        name: 'Steward Ilo Marr',
        role: 'Relief Steward',
        factionId: 'nova_relief',
        bio: 'Counts every ration crate and knows every hungry family.',
        stock: [
          { itemId: 'food', kind: 'supply', ask: 18 },
          { itemId: 'water', kind: 'supply', ask: 16 },
          { itemId: 'medicine', kind: 'good', ask: 166, bid: 124 },
        ],
      },
      {
        id: 'nova-vessa',
        name: 'Vessa Coil',
        role: 'Frontier Broker',
        factionId: 'free_caravans',
        bio: 'Can source silk, ore, and gossip with equal confidence.',
        stock: [
          { itemId: 'ore', kind: 'good', ask: 38, bid: 24 },
          { itemId: 'star_silk', kind: 'good', ask: 255, bid: 185 },
          { itemId: 'food', kind: 'supply', ask: 19 },
        ],
      },
      {
        id: 'nova-quill',
        name: 'Marshal Quill',
        role: 'Longhaul Fuel Rigger',
        factionId: 'vega_exchange',
        bio: 'Runs escorted tankers and keeps one eye on frontier balance sheets.',
        stock: [
          { itemId: 'fuel', kind: 'supply', ask: 10 },
          { itemId: 'medicine', kind: 'good', ask: 170, bid: 128 },
          { itemId: 'alien_relics', kind: 'good', ask: 760, bid: 590 },
        ],
      },
    ],
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

const diplomacy: Record<FactionId, DiplomacyState> = {
  vega_exchange: { relationship: 35, alliance: 'trade_pact' },
  sirius_guild: { relationship: 8, alliance: 'none' },
  nova_relief: { relationship: 22, alliance: 'none' },
  free_caravans: { relationship: 18, alliance: 'none' },
  dust_runners: { relationship: -6, alliance: 'none' },
};

const factionAliases: Record<string, BargainFactionId> = {
  vega: 'vega_union',
  vega_union: 'vega_union',
  exchange: 'vega_union',
  sirius: 'eclipse_combine',
  eclipse: 'eclipse_combine',
  eclipse_combine: 'eclipse_combine',
  guild: 'eclipse_combine',
  dust: 'eclipse_combine',
  nova: 'nova_frontier',
  nova_frontier: 'nova_frontier',
  relief: 'nova_frontier',
  caravans: 'nova_frontier',
};

const factionToBargainFaction: Record<FactionId, BargainFactionId> = {
  vega_exchange: 'vega_union',
  sirius_guild: 'eclipse_combine',
  nova_relief: 'nova_frontier',
  free_caravans: 'nova_frontier',
  dust_runners: 'eclipse_combine',
};

const bargainFactionToMainFaction: Record<BargainFactionId, FactionId> = {
  vega_union: 'vega_exchange',
  eclipse_combine: 'sirius_guild',
  nova_frontier: 'nova_relief',
};

const factionStates = structuredClone(bargainingFactions) as Record<BargainFactionId, BargainFaction>;
const bargainingState: {
  selectedFactionId: BargainFactionId;
  message: string;
  pendingOffer?: NegotiationOffer;
  pendingResult?: NegotiationResult;
} = {
  selectedFactionId: 'vega_union',
  message: 'Open a faction channel, chat, or offer concrete terms.',
};

const factionIds = Object.keys(factions) as FactionId[];

let gameOver = false;
let gameOverReason = '';
let pendingEvent: PendingEvent | null = null;
let activeSpecial: MarketSpecial | null = null;
let activeSidebarTab: SidebarTab = 'market';
let selectedVendorId: string | null = null;

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
          <h2>NETWORK</h2>
          <div class="tab-row">
            <button id="tab-market" class="tab-button">MARKET</button>
            <button id="tab-ledger" class="tab-button">LEDGER</button>
            <button id="tab-bargain" class="tab-button">BARGAIN</button>
          </div>
          <div id="network-panel"></div>
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
        <input id="manual-input" placeholder="type command, e.g. buy ore 1, vendor vega-vanto, gift 120" autocomplete="off" />
      </form>
    </footer>
  </div>
`;

const logEl = document.querySelector<HTMLDivElement>('#log')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const inventoryEl = document.querySelector<HTMLDivElement>('#inventory')!;
const networkPanelEl = document.querySelector<HTMLDivElement>('#network-panel')!;
const diplomacyEl = document.querySelector<HTMLDivElement>('#diplomacy')!;
const commandsEl = document.querySelector<HTMLDivElement>('#commands')!;
const headerLocationEl = document.querySelector<HTMLDivElement>('#header-location')!;
const headerDayEl = document.querySelector<HTMLDivElement>('#header-day')!;
const manualForm = document.querySelector<HTMLFormElement>('#manual-form')!;
const manualInput = document.querySelector<HTMLInputElement>('#manual-input')!;
const tabMarketButton = document.querySelector<HTMLButtonElement>('#tab-market')!;
const tabLedgerButton = document.querySelector<HTMLButtonElement>('#tab-ledger')!;
const tabBargainButton = document.querySelector<HTMLButtonElement>('#tab-bargain')!;

tabMarketButton.addEventListener('click', () => {
  activeSidebarTab = 'market';
  render();
});

tabLedgerButton.addEventListener('click', () => {
  activeSidebarTab = 'ledger';
  render();
});

tabBargainButton.addEventListener('click', () => {
  bargainingState.selectedFactionId = factionToBargainFaction[currentVendor().factionId];
  activeSidebarTab = 'bargain';
  render();
});

function currentLocation(): Location {
  return locations[player.locationId];
}

function locationName(locationId: LocationId): string {
  return locations[locationId].name;
}

function factionName(factionId: FactionId): string {
  return factions[factionId].name;
}

function itemName(itemId: TradeItemId): string {
  if (itemId in goods) {
    return goods[itemId as GoodId].name;
  }

  return supplies[itemId as SupplyId].name;
}

function vendorsAtLocation(locationId = player.locationId): Vendor[] {
  return locations[locationId].vendors;
}

function ensureSelectedVendor(): void {
  const vendors = vendorsAtLocation();

  if (vendors.length === 0) {
    selectedVendorId = null;
    return;
  }

  const stillVisible = vendors.some((vendor) => vendor.id === selectedVendorId);

  if (!stillVisible) {
    selectedVendorId = vendors[0].id;
  }
}

function currentVendor(): Vendor {
  ensureSelectedVendor();
  const vendor = vendorsAtLocation().find((entry) => entry.id === selectedVendorId);

  if (!vendor) {
    throw new Error('No active vendor available.');
  }

  return vendor;
}

function currentFactionState(): DiplomacyState {
  return diplomacy[currentVendor().factionId];
}

function cargoUsed(): number {
  return Object.values(player.cargo).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

function bargainingPlayerInventory(): BargainInventory {
  return {
    credits: player.credits,
    water: player.supplies.water,
    fuel_cells: player.supplies.fuel,
    medicine: player.cargo.medicine ?? 0,
    ore: player.cargo.ore ?? 0,
    star_silk: player.cargo.star_silk ?? 0,
    alien_relics: player.cargo.alien_relics ?? 0,
  };
}

function commitBargainingInventory(inventory: BargainInventory): void {
  player.credits = inventory.credits ?? 0;
  player.supplies.water = inventory.water ?? 0;
  player.supplies.fuel = inventory.fuel_cells ?? 0;

  for (const goodId of Object.keys(goods) as GoodId[]) {
    const amount = inventory[goodId as ResourceId] ?? 0;

    if (amount > 0) {
      player.cargo[goodId] = amount;
    } else {
      delete player.cargo[goodId];
    }
  }
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

function stanceLabel(stance: FactionStance): string {
  if (stance === 'ally') return 'Ally';
  if (stance === 'friendly') return 'Friendly';
  if (stance === 'rival') return 'Rival';
  if (stance === 'hostile') return 'Hostile';
  return 'Neutral';
}

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomFaction(exclude: FactionId[] = []): FactionId {
  return randomPick(factionIds.filter((factionId) => !exclude.includes(factionId)));
}

function randomFactionPair(): [FactionId, FactionId] {
  const first = randomFaction();
  const second = randomFaction([first]);
  return [first, second];
}

function adjustRelationship(factionId: FactionId, change: number): void {
  diplomacy[factionId].relationship = Math.max(-100, Math.min(100, diplomacy[factionId].relationship + change));
}

function factionStance(first: FactionId, second: FactionId): FactionStance {
  if (first === second) return 'ally';

  return factionLinks[first][second] ?? factionLinks[second][first] ?? 'neutral';
}

function tradeRippleEntries(primaryFaction: FactionId, directGain: number): RippleEntry[] {
  const entries: RippleEntry[] = [{ factionId: primaryFaction, change: directGain }];

  for (const factionId of factionIds) {
    if (factionId === primaryFaction) continue;

    const stance = factionStance(primaryFaction, factionId);
    let change = 0;

    if (stance === 'ally') change = 1;
    else if (stance === 'friendly') change = 1;
    else if (stance === 'rival') change = -1;
    else if (stance === 'hostile') change = -2;

    if (change !== 0) {
      entries.push({ factionId, change });
    }
  }

  return entries;
}

function formatRipple(entries: RippleEntry[]): string {
  return entries
    .map((entry) => `${entry.change > 0 ? '+' : ''}${entry.change} ${factionName(entry.factionId)}`)
    .join(', ');
}

function applyTradeRipple(primaryFaction: FactionId, directGain: number): string {
  const entries = tradeRippleEntries(primaryFaction, directGain);

  for (const entry of entries) {
    adjustRelationship(entry.factionId, entry.change);
  }

  return formatRipple(entries);
}

function findOffer(vendor: Vendor, itemId: TradeItemId): VendorOffer | undefined {
  return vendor.stock.find((offer) => offer.itemId === itemId);
}

function offerPrices(vendor: Vendor, offer: VendorOffer): { ask: number; bid?: number } {
  const factionState = diplomacy[vendor.factionId];
  let askFactor = 1;
  let bidFactor = 1;

  if (factionState.relationship >= 80) {
    askFactor -= 0.08;
    bidFactor += 0.08;
  } else if (factionState.relationship >= 50) {
    askFactor -= 0.05;
    bidFactor += 0.05;
  } else if (factionState.relationship > 10) {
    askFactor -= 0.02;
    bidFactor += 0.02;
  } else if (factionState.relationship < -40) {
    askFactor += 0.18;
    bidFactor -= 0.18;
  } else if (factionState.relationship < -10) {
    askFactor += 0.08;
    bidFactor -= 0.08;
  }

  if (factionState.alliance === 'trade_pact') {
    askFactor -= 0.04;
    bidFactor += 0.04;
  }

  if (factionState.alliance === 'alliance') {
    askFactor -= 0.07;
    bidFactor += 0.07;
  }

  if (activeSpecial && activeSpecial.vendorId === vendor.id && activeSpecial.itemId === offer.itemId) {
    if (activeSpecial.type === 'discount') {
      askFactor -= 0.22;
    } else if (activeSpecial.type === 'buyback' && offer.bid !== undefined) {
      bidFactor += 0.22;
    }
  }

  const ask = Math.max(1, Math.round(offer.ask * askFactor));
  let bid = offer.bid === undefined ? undefined : Math.max(1, Math.round(offer.bid * bidFactor));

  if (bid !== undefined && ask <= bid) {
    return { ask: bid + 1, bid };
  }

  return { ask, bid };
}

function specialBadge(vendorId: string, itemId: TradeItemId): string {
  if (!activeSpecial || activeSpecial.vendorId !== vendorId || activeSpecial.itemId !== itemId) {
    return '';
  }

  return activeSpecial.type === 'discount' ? 'FLASH SALE' : 'HIGH DEMAND';
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

function createBorderWarEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - CONVOY WAR',
    description: `${factionName(first)} and ${factionName(second)} have armed freighters firing across a trade corridor. Your ship is asked to pick a side or stay out.`,
    options: [
      {
        command: `support ${first}`,
        label: `Support ${factionName(first)}`,
        effect: () => {
          const fee = loseCredits(90);
          adjustRelationship(first, 14);
          adjustRelationship(second, -12);
          log(
            `You funnel ${fee} credits in emergency cargo support to ${factionName(first)}.\nTheir standing rises, and ${factionName(second)} marks you as an enemy broker.`
          );
        },
      },
      {
        command: `support ${second}`,
        label: `Support ${factionName(second)}`,
        effect: () => {
          const fee = loseCredits(90);
          adjustRelationship(second, 14);
          adjustRelationship(first, -12);
          log(
            `You funnel ${fee} credits in emergency cargo support to ${factionName(second)}.\nTheir standing rises, and ${factionName(first)} marks you as an enemy broker.`
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
            `You refuse to enter the convoy war.\nBoth sides call you cautious and unreliable under fire.`
          );
        },
      },
    ],
  };
}

function createTariffHearingEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - TARIFF HEARING',
    description: `${factionName(first)} accuses ${factionName(second)} of predatory tariffs. A trade witness is needed.`,
    options: [
      {
        command: `endorse ${first}`,
        label: `Endorse ${factionName(first)}`,
        effect: () => {
          gainSupply('food', 2);
          adjustRelationship(first, 12);
          adjustRelationship(second, -10);
          log(
            `You testify in favor of ${factionName(first)}.\nThey reward you with fresh provisions, while ${factionName(second)} feels publicly betrayed.`
          );
        },
      },
      {
        command: `endorse ${second}`,
        label: `Endorse ${factionName(second)}`,
        effect: () => {
          player.credits += 80;
          adjustRelationship(second, 12);
          adjustRelationship(first, -10);
          log(
            `You endorse ${factionName(second)} in the tariff hearing.\nTheir merchants pay you for the favor, and ${factionName(first)} turns cold.`
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
            `You decline to testify and offer quiet mediation instead.\nNo one gains much, but both factions respect your restraint.`
          );
        },
      },
    ],
  };
}

function createRefugeeCorridorEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - REFUGEE CORRIDOR',
    description: `Refugee ships are trapped between patrol zones claimed by ${factionName(first)} and ${factionName(second)}. Your freighter can escort one side's rescue effort.`,
    options: [
      {
        command: `aid ${first}`,
        label: `Aid ${factionName(first)}`,
        effect: () => {
          loseSupply('fuel', 6);
          adjustRelationship(first, 16);
          adjustRelationship(second, -6);
          log(
            `You burn 6 fuel escorting relief craft aligned with ${factionName(first)}.\nThey remember the help, while ${factionName(second)} resents being passed over.`
          );
        },
      },
      {
        command: `aid ${second}`,
        label: `Aid ${factionName(second)}`,
        effect: () => {
          loseSupply('fuel', 6);
          adjustRelationship(second, 16);
          adjustRelationship(first, -6);
          log(
            `You burn 6 fuel escorting relief craft aligned with ${factionName(second)}.\nThey remember the help, while ${factionName(first)} resents being passed over.`
          );
        },
      },
      {
        command: 'aid none',
        label: 'Stay Clear',
        effect: () => {
          loseCredits(40);
          adjustRelationship(first, -5);
          adjustRelationship(second, -5);
          log(
            `You decline corridor duty and only broadcast a warning relay.\nThe stranded civilians survive without your help, and both factions judge you harshly.`
          );
        },
      },
    ],
  };
}

function runGoodEvent(): void {
  const goodEvents = [
    () => {
      const factionId = randomFaction();
      player.credits += 180;
      adjustRelationship(factionId, 8);
      log(
        `GOOD EVENT - SALVAGE BEACON\nYou recover a legal salvage cache and turn it in cleanly.\nCredits +180, and ${factionName(factionId)} notes your honesty.`
      );
    },
    () => {
      gainSupply('food', 3);
      gainSupply('water', 3);
      gainSupply('fuel', 8);
      log(
        'GOOD EVENT - RELIEF CONVOY\nA passing convoy tops up your essentials.\nFood +3, water +3, fuel +8.'
      );
    },
    () => {
      const goodId = randomPick(Object.keys(goods) as GoodId[]);
      gainCargo(goodId, 2);
      player.credits += 70;
      log(
        `GOOD EVENT - FESTIVAL CHARTER\nYou land a ceremonial hauling contract.\nCredits +70 and ${goods[goodId].name} +2.`
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
        `BAD EVENT - HULL BREACH\nA seal failure spoils your stores.\nFood -${foodLost}, water -${waterLost}.`
      );
    },
    () => {
      const creditsLost = loseCredits(160);
      log(
        `BAD EVENT - PIRATE TOLL\nAn outlaw checkpoint strips value from your hold.\nCredits -${creditsLost}.`
      );
    },
    () => {
      const fuelLost = loseSupply('fuel', 10);
      const factionId = randomFaction();
      adjustRelationship(factionId, -8);
      log(
        `BAD EVENT - MISSED DELIVERY\nA fuel manifold fracture costs ${fuelLost} fuel.\nYour delay also angers ${factionName(factionId)}.`
      );
    },
  ];

  randomPick(badEvents)();
}

function prepareNeutralEvent(): void {
  const neutralEvents = [createBorderWarEvent, createTariffHearingEvent, createRefugeeCorridorEvent];
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

function maybeRollSpecialOffer(): void {
  activeSpecial = null;

  if (Math.random() >= 0.1) {
    return;
  }

  const vendor = randomPick(vendorsAtLocation());
  const offer = randomPick(vendor.stock);
  const type = offer.kind === 'supply' ? 'discount' : randomPick(['discount', 'buyback'] as const);

  activeSpecial = {
    vendorId: vendor.id,
    itemId: offer.itemId,
    type,
    description:
      type === 'discount'
        ? `${vendor.name} posts a flash sale on ${itemName(offer.itemId)}.`
        : `${vendor.name} announces high-demand buyback rates for ${itemName(offer.itemId)}.`,
  };

  log(`SPECIAL OFFER\n${activeSpecial.description}`);
}

function advanceTurn(summary: string): void {
  if (gameOver) return;

  player.day += 1;
  player.credits += incomePerTurn();
  consumeSupplies();

  log(
    `${summary}\nTurn income: ${incomePerTurn()} credits.\nSupplies consumed: food -2, water -2, fuel -1.`
  );

  maybeTriggerRandomEvent();
  maybeRollSpecialOffer();
  checkGameOver();
}

function log(message: string): void {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.textContent = message;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function renderStatus(): void {
  const location = currentLocation();
  const vendor = currentVendor();
  const factionState = currentFactionState();

  statusEl.innerHTML = `
    <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
    <div class="stat-row"><span>Turn Income</span><strong>${incomePerTurn()}</strong></div>
    <div class="stat-row"><span>Location</span><strong>${location.name}</strong></div>
    <div class="stat-row"><span>Vendor</span><strong>${vendor.name}</strong></div>
    <div class="stat-row"><span>Standing</span><strong>${factionState.relationship}</strong></div>
    <div class="stat-row"><span>Cargo</span><strong>${cargoUsed()} / ${player.cargoCapacity}</strong></div>
  `;
}

function renderInventory(): void {
  const supplyRows = Object.values(supplies)
    .map((supply) => {
      const amount = player.supplies[supply.id];
      const critical = amount < supply.warning ? ' danger' : '';
      return `<div class="stat-row${critical}"><span>${supply.name}</span><strong>${amount} / min ${supply.warning}</strong></div>`;
    })
    .join('');

  const cargoRows = Object.entries(player.cargo)
    .map(([goodId, amount]) => {
      return `<div class="stat-row"><span>${goods[goodId as GoodId].name}</span><strong>${amount}</strong></div>`;
    })
    .join('');

  inventoryEl.innerHTML = `
    <div class="box-subtitle">ESSENTIAL SUPPLIES</div>
    ${supplyRows}
    <div class="box-subtitle inventory-separator">TRADE CARGO</div>
    ${cargoRows || `<div class="muted">Empty cargo hold</div>`}
  `;
}

function renderMarketTab(): void {
  const vendorCards = vendorsAtLocation()
    .map((vendor) => {
      const active = vendor.id === currentVendor().id ? ' active-vendor' : '';
      const stockLines = vendor.stock
        .map((offer) => {
          const prices = offerPrices(vendor, offer);
          const badge = specialBadge(vendor.id, offer.itemId);
          return `
            <div class="vendor-line">
              <span>${itemName(offer.itemId)}</span>
              <strong>A ${prices.ask}${prices.bid !== undefined ? ` | B ${prices.bid}` : ''}</strong>
              ${badge ? `<em class="special-badge">${badge}</em>` : ''}
            </div>
          `;
        })
        .join('');

      return `
        <div class="vendor-card${active}" data-vendor-id="${vendor.id}">
          <div class="vendor-head">
            <strong>${vendor.name}</strong>
            <span>${factionName(vendor.factionId)}</span>
          </div>
          <div class="vendor-role">${vendor.role}</div>
          <div class="vendor-bio">${vendor.bio}</div>
          <div class="vendor-stock">${stockLines}</div>
        </div>
      `;
    })
    .join('');

  const activeVendor = currentVendor();
  const ripple = formatRipple(tradeRippleEntries(activeVendor.factionId, 2));
  const specialText =
    activeSpecial && activeSpecial.vendorId === activeVendor.id
      ? `<div class="vendor-special-note">${activeSpecial.description}</div>`
      : '';

  networkPanelEl.innerHTML = `
    <div class="box-subtitle">STATION VENDORS</div>
    <div class="vendor-list">${vendorCards}</div>
    <div class="box-subtitle inventory-separator">ACTIVE COUNTERPARTY</div>
    <div class="vendor-detail">
      <div class="stat-row"><span>Name</span><strong>${activeVendor.name}</strong></div>
      <div class="stat-row"><span>Role</span><strong>${activeVendor.role}</strong></div>
      <div class="stat-row"><span>Faction</span><strong>${factionName(activeVendor.factionId)}</strong></div>
      <div class="stat-row"><span>Trade Ripple</span><strong>${ripple}</strong></div>
      ${specialText}
    </div>
  `;

  networkPanelEl.querySelectorAll<HTMLDivElement>('.vendor-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectVendor(card.dataset.vendorId ?? '');
    });
  });
}

function renderLedgerTab(): void {
  const factionCards = factionIds
    .map((factionId) => {
      const state = diplomacy[factionId];
      const allies = factionIds
        .filter((otherId) => otherId !== factionId && factionStance(factionId, otherId) === 'ally')
        .map((otherId) => factions[otherId].name)
        .join(', ');
      const rivals = factionIds
        .filter((otherId) => otherId !== factionId && factionStance(factionId, otherId) === 'rival')
        .map((otherId) => factions[otherId].name)
        .join(', ');
      const hostiles = factionIds
        .filter((otherId) => otherId !== factionId && factionStance(factionId, otherId) === 'hostile')
        .map((otherId) => factions[otherId].name)
        .join(', ');

      return `
        <div class="ledger-card">
          <div class="ledger-title">${factions[factionId].name}</div>
          <div class="ledger-copy">${factions[factionId].identity}</div>
          <div class="stat-row"><span>Your Standing</span><strong>${state.relationship} (${relationshipTier(state.relationship)})</strong></div>
          <div class="stat-row"><span>Your Pact</span><strong>${allianceLabel(state.alliance)}</strong></div>
          <div class="ledger-copy">Allies: ${allies || 'None'}</div>
          <div class="ledger-copy">Rivals: ${rivals || 'None'}</div>
          <div class="ledger-copy">Hostile: ${hostiles || 'None'}</div>
        </div>
      `;
    })
    .join('');

  networkPanelEl.innerHTML = `
    <div class="box-subtitle">UNIVERSE LEDGER</div>
    <div class="ledger-list">${factionCards}</div>
  `;
}

function renderBargainTab(): void {
  networkPanelEl.innerHTML = renderBargainingPanel({
    factions: bargainingFactionViews(),
    selectedFactionId: bargainingState.selectedFactionId,
    playerInventory: bargainingPlayerInventory(),
    message: bargainingState.message,
    pendingOffer: bargainingState.pendingOffer,
    pendingResult: bargainingState.pendingResult,
  });

  bindBargainingControls(networkPanelEl, {
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
    id: factionId as BargainFactionId,
    name: faction.name,
    relationshipWithPlayer: faction.relationshipWithPlayer,
    trust: faction.trust,
    inventory: faction.inventory as ResourceBundle,
  }));
}

function renderDiplomacy(): void {
  const vendor = currentVendor();
  const factionState = diplomacy[vendor.factionId];
  const governor = factions[currentLocation().governingFaction];
  const relations = factionIds
    .filter((factionId) => factionId !== vendor.factionId)
    .map((factionId) => `${stanceLabel(factionStance(vendor.factionId, factionId))}: ${factionName(factionId)}`)
    .join('<br />');

  diplomacyEl.innerHTML = `
    <div class="stat-row"><span>Vendor Faction</span><strong>${factionName(vendor.factionId)}</strong></div>
    <div class="stat-row"><span>Relationship</span><strong>${factionState.relationship}</strong></div>
    <div class="stat-row"><span>Tier</span><strong>${relationshipTier(factionState.relationship)}</strong></div>
    <div class="stat-row"><span>Alliance</span><strong>${allianceLabel(factionState.alliance)}</strong></div>
    <div class="stat-row"><span>Port Authority</span><strong>${governor.name}</strong></div>
    <div class="ledger-copy inventory-separator">${relations}</div>
  `;
}

function renderCommands(): void {
  if (gameOver) {
    commandsEl.innerHTML = `<div class="game-over-box">GAME OVER: ${gameOverReason}</div>`;
    return;
  }

  if (pendingEvent) {
    let index = 1;
    const eventButtons = [
      ...pendingEvent.options.map((option) => ({ label: option.label, command: option.command })),
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

    commandsEl.querySelectorAll<HTMLButtonElement>('.command-button').forEach((button) => {
      button.addEventListener('click', () => {
        executeCommand(button.dataset.command ?? '');
      });
    });

    return;
  }

  const vendor = currentVendor();
  let index = 1;
  const commandButtons: { label: string; command: string }[] = [
    { label: 'Status', command: 'status' },
    { label: 'Market', command: 'market' },
    { label: 'Relations', command: 'relations' },
    { label: 'View Ledger', command: 'tab ledger' },
    { label: 'Bargain AI', command: 'bargain' },
  ];

  for (const stationVendor of vendorsAtLocation()) {
    commandButtons.push({
      label: `Talk to ${stationVendor.name}`,
      command: `vendor ${stationVendor.id}`,
    });
  }

  for (const offer of vendor.stock) {
    const amount = offer.kind === 'supply' ? (offer.itemId === 'fuel' ? 6 : 3) : 1;
    commandButtons.push({
      label: `Buy ${itemName(offer.itemId)} x${amount}`,
      command: `buy ${offer.itemId} ${amount}`,
    });

    if (offer.bid !== undefined) {
      commandButtons.push({
        label: `Sell ${itemName(offer.itemId)} x1`,
        command: `sell ${offer.itemId} 1`,
      });
    }
  }

  commandButtons.push({ label: 'Gift 100 Credits', command: 'gift 100' });

  const state = diplomacy[vendor.factionId];

  if (state.alliance === 'none') {
    commandButtons.push({ label: 'Request Trade Pact', command: 'pact' });
  } else if (state.alliance === 'trade_pact') {
    commandButtons.push({ label: 'Request Alliance', command: 'alliance' });
  }

  for (const [destinationId, fuelCost] of Object.entries(currentLocation().routes)) {
    commandButtons.push({
      label: `Travel ${locationName(destinationId as LocationId)} (${fuelCost} fuel)`,
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

  commandsEl.querySelectorAll<HTMLButtonElement>('.command-button').forEach((button) => {
    button.addEventListener('click', () => {
      executeCommand(button.dataset.command ?? '');
    });
  });
}

function render(): void {
  ensureSelectedVendor();
  const location = currentLocation();

  headerLocationEl.textContent = location.name;
  headerDayEl.textContent = gameOver ? 'GAME OVER' : `DAY ${player.day}`;

  tabMarketButton.className = activeSidebarTab === 'market' ? 'tab-button active-tab' : 'tab-button';
  tabLedgerButton.className = activeSidebarTab === 'ledger' ? 'tab-button active-tab' : 'tab-button';
  tabBargainButton.className = activeSidebarTab === 'bargain' ? 'tab-button active-tab' : 'tab-button';

  renderStatus();
  renderInventory();

  if (activeSidebarTab === 'market') {
    renderMarketTab();
  } else if (activeSidebarTab === 'ledger') {
    renderLedgerTab();
  } else {
    renderBargainTab();
  }

  renderDiplomacy();
  renderCommands();

  manualInput.disabled = gameOver;
  manualInput.placeholder = gameOver
    ? 'game over'
    : 'type command, e.g. buy ore 1, bargain, or offer 140 credits for medicine';
}

function showStatus(): void {
  const location = currentLocation();
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];

  log(
    `STATUS
Credits: ${player.credits}
Turn income: ${incomePerTurn()}
Location: ${location.name}
Counterparty: ${vendor.name} (${factionName(vendor.factionId)})
Relationship: ${state.relationship} (${relationshipTier(state.relationship)})
Alliance: ${allianceLabel(state.alliance)}
Food: ${player.supplies.food}
Water: ${player.supplies.water}
Fuel: ${player.supplies.fuel}
Cargo: ${cargoUsed()} / ${player.cargoCapacity}`
  );
}

function showMarket(): void {
  const vendor = currentVendor();
  const lines = vendor.stock
    .map((offer) => {
      const prices = offerPrices(vendor, offer);
      const badge = specialBadge(vendor.id, offer.itemId);
      return `${itemName(offer.itemId).padEnd(14)} buy ${String(prices.ask).padEnd(4)}${prices.bid !== undefined ? ` sell ${prices.bid}` : ' sell -'}${badge ? ` ${badge}` : ''}`;
    })
    .join('\n');

  log(`MARKET - ${vendor.name}\n${vendor.role}\n${lines}`);
}

function showRelations(): void {
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];
  const ripple = formatRipple(tradeRippleEntries(vendor.factionId, 2));

  log(
    `RELATIONS - ${factionName(vendor.factionId)}
Relationship: ${state.relationship}
Tier: ${relationshipTier(state.relationship)}
Alliance: ${allianceLabel(state.alliance)}
Trade ripple: ${ripple}`
  );
}

function showBargainingHelp(): void {
  activeSidebarTab = 'bargain';
  bargainingState.selectedFactionId = factionToBargainFaction[currentVendor().factionId];

  const factionsList = Object.values(factionStates)
    .map((faction) => `${faction.name}: ${faction.ideology}`)
    .join('\n');

  log(`BARGAINING CHANNEL
Use the Network > Bargain tab, or type a natural offer.
Accepted deals only apply after Confirm Deal.

Examples:
I offer Vega 140 credits for 1 medicine as humanitarian aid.
offer eclipse credits 500 for alien_relics 1
what do you need?

${factionsList}`);
}

async function submitBargainingOffer(offer: NegotiationOffer): Promise<void> {
  const faction = factionStates[offer.toFaction];
  const result = evaluateOffer(offer, faction);
  const fallbackDialogue = generateDialogue(result, faction.name);

  bargainingState.selectedFactionId = offer.toFaction;
  bargainingState.pendingOffer = offer;
  bargainingState.pendingResult = result;
  bargainingState.message = 'Transmission sent. Awaiting faction response...';
  activeSidebarTab = 'bargain';
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
  activeSidebarTab = 'bargain';
  bargainingState.selectedFactionId = factionToBargainFaction[currentVendor().factionId];
  bargainingState.message = 'Parsing bargain into structured JSON...';
  render();

  const structured = await requestStructuredBargainingIntent({
    message,
    selectedFactionId: bargainingState.selectedFactionId,
    factionAliases,
    playerInventory: bargainingPlayerInventory(),
    factionInventories: factionInventorySnapshot(),
  });
  const freeformResult = evaluateStructuredBargain(structured, factionStates, bargainingPlayerInventory());
  const faction = factionStates[structured.toFaction];

  bargainingState.selectedFactionId = structured.toFaction;
  bargainingState.pendingOffer =
    freeformResult.computedResult.outcome === 'accept' ||
    freeformResult.computedResult.outcome === 'counteroffer'
      ? freeformResult.offer
      : undefined;
  bargainingState.pendingResult = freeformResult.computedResult;

  if (freeformResult.computedResult.reason === 'lie_detected') {
    applyBargainingRelationshipChange(structured.toFaction, freeformResult.computedResult);
  }

  if (freeformResult.computedResult.reason === 'overly_good_suspicious') {
    applyBargainingRelationshipChange(structured.toFaction, freeformResult.computedResult);
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
          playerInventory: bargainingPlayerInventory(),
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

function factionInventorySnapshot(): Record<BargainFactionId, ResourceBundle> {
  return Object.entries(factionStates).reduce((snapshot, [factionId, faction]) => {
    snapshot[factionId as BargainFactionId] = faction.inventory as ResourceBundle;
    return snapshot;
  }, {} as Record<BargainFactionId, ResourceBundle>);
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
  const inventory = bargainingPlayerInventory();
  const beforeCredits = player.credits;
  const beforeCargo = cargoUsed();
  const beforeSupplies = { ...player.supplies };
  const beforeFactionInventory = { ...(faction.inventory as BargainInventory) };
  const simulatedInventory = { ...inventory };
  const simulatedFactionInventory = { ...(faction.inventory as BargainInventory) };
  const tradeResult = applyTradeToInventories(
    simulatedInventory,
    simulatedFactionInventory,
    offer.offered,
    offer.requested
  );

  if (!tradeResult.success) {
    bargainingState.message = tradeResult.message;
    log(tradeResult.message);
    render();
    return;
  }

  if (bargainingCargoUsed(simulatedInventory) > player.cargoCapacity) {
    bargainingState.message = 'The deal would exceed your cargo capacity.';
    log('The deal would exceed your cargo capacity.');
    render();
    return;
  }

  commitBargainingInventory(simulatedInventory);
  faction.inventory = simulatedFactionInventory as BargainFaction['inventory'];
  applyBargainingRelationshipChange(offer.toFaction, result);

  const message = `Deal completed: ${formatBundle(offer.offered)} for ${formatBundle(offer.requested)}.
Credits: ${beforeCredits} -> ${player.credits}
Food/Water/Fuel: ${beforeSupplies.food}/${beforeSupplies.water}/${beforeSupplies.fuel} -> ${player.supplies.food}/${player.supplies.water}/${player.supplies.fuel}
Cargo used: ${beforeCargo} -> ${cargoUsed()}
${faction.name} stores changed: ${formatBundle(beforeFactionInventory)} -> ${formatBundle(faction.inventory as ResourceBundle)}`;
  bargainingState.pendingOffer = undefined;
  bargainingState.pendingResult = undefined;
  bargainingState.message = message;
  log(message);
  render();
}

function bargainingCargoUsed(inventory: BargainInventory): number {
  return Object.keys(goods).reduce((total, goodId) => {
    return total + (inventory[goodId as ResourceId] ?? 0);
  }, 0);
}

function applyBargainingRelationshipChange(factionId: BargainFactionId, result: NegotiationResult): void {
  const delta = relationshipDeltaAfterTrade(result);
  const mainFactionId = bargainFactionToMainFaction[factionId];

  factionStates[factionId].relationshipWithPlayer += delta.relationshipWithPlayer;
  factionStates[factionId].trust += delta.trust;
  adjustRelationship(mainFactionId, delta.relationshipWithPlayer);
}

function selectVendor(vendorId: string): void {
  const vendor = vendorsAtLocation().find((entry) => entry.id === vendorId);

  if (!vendor) {
    log('Unknown vendor at this port.');
    return;
  }

  selectedVendorId = vendor.id;
  bargainingState.selectedFactionId = factionToBargainFaction[vendor.factionId];
  activeSidebarTab = activeSidebarTab === 'bargain' ? 'bargain' : 'market';
  log(`You open a channel to ${vendor.name}.\n${vendor.role} - ${vendor.bio}`);
  render();
}

function buy(itemIdText: string, amountText: string): void {
  const itemId = itemIdText as TradeItemId;
  const amount = Number(amountText);
  const vendor = currentVendor();
  const offer = findOffer(vendor, itemId);

  if (!offer || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid purchase. Example: buy ore 1');
    return;
  }

  const prices = offerPrices(vendor, offer);
  const totalCost = prices.ask * amount;

  if (player.credits < totalCost) {
    log(`Not enough credits. Need ${totalCost} credits.`);
    return;
  }

  if (offer.kind === 'good' && cargoUsed() + amount > player.cargoCapacity) {
    log('Not enough cargo space.');
    return;
  }

  player.credits -= totalCost;

  if (offer.kind === 'supply') {
    player.supplies[itemId as SupplyId] += amount;
  } else {
    player.cargo[itemId as GoodId] = (player.cargo[itemId as GoodId] ?? 0) + amount;
  }

  const ripple = applyTradeRipple(vendor.factionId, offer.kind === 'good' ? 2 : 1);
  log(
    `Bought ${amount} ${itemName(itemId)} from ${vendor.name} for ${totalCost} credits.\nFaction ripple: ${ripple}.`
  );
}

function sell(itemIdText: string, amountText: string): void {
  const itemId = itemIdText as GoodId;
  const amount = Number(amountText);
  const vendor = currentVendor();
  const offer = findOffer(vendor, itemId);

  if (!offer || offer.bid === undefined || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid sale. Example: sell ore 1');
    return;
  }

  const owned = player.cargo[itemId] ?? 0;

  if (owned < amount) {
    log(`You do not have enough ${goods[itemId].name}.`);
    return;
  }

  const prices = offerPrices(vendor, offer);
  const earned = (prices.bid ?? 0) * amount;

  player.credits += earned;
  player.cargo[itemId] = owned - amount;

  if (player.cargo[itemId] === 0) {
    delete player.cargo[itemId];
  }

  const ripple = applyTradeRipple(vendor.factionId, 2);
  log(
    `Sold ${amount} ${goods[itemId].name} to ${vendor.name} for ${earned} credits.\nFaction ripple: ${ripple}.`
  );
}

function gift(amountText: string): void {
  const amount = Number(amountText);
  const vendor = currentVendor();

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
  adjustRelationship(vendor.factionId, relationshipGain);

  log(
    `You send a ${amount}-credit goodwill package to ${vendor.name}.\n${factionName(vendor.factionId)} relationship improves by ${relationshipGain}.`
  );
}

function requestTradePact(): void {
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];
  const fee = 140;

  if (state.alliance !== 'none') {
    log(`${factionName(vendor.factionId)} already has a formal agreement with you.`);
    return;
  }

  if (state.relationship < 35) {
    log('Relationship is too low for a trade pact. Reach at least 35 first.');
    return;
  }

  if (player.credits < fee) {
    log(`Not enough credits. Need ${fee} credits for registry fees.`);
    return;
  }

  player.credits -= fee;
  state.alliance = 'trade_pact';
  adjustRelationship(vendor.factionId, 10);

  log(
    `${factionName(vendor.factionId)} signs a trade pact with your ship.\nYou now receive better terms from every vendor aligned with them.`
  );
}

function requestAlliance(): void {
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];
  const fee = 240;

  if (state.alliance === 'alliance') {
    log(`${factionName(vendor.factionId)} is already bound to you by an alliance contract.`);
    return;
  }

  if (state.alliance !== 'trade_pact') {
    log('You need a trade pact before requesting a full alliance.');
    return;
  }

  if (state.relationship < 75) {
    log('Relationship is too low for an alliance. Reach at least 75 first.');
    return;
  }

  if (player.credits < fee) {
    log(`Not enough credits. Need ${fee} credits for alliance guarantees.`);
    return;
  }

  player.credits -= fee;
  state.alliance = 'alliance';
  adjustRelationship(vendor.factionId, 8);

  log(
    `${factionName(vendor.factionId)} accepts an alliance contract.\nTheir vendors now treat you as a strategic partner.`
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
  selectedVendorId = destination.vendors[0]?.id ?? null;
  activeSidebarTab = 'market';

  advanceTurn(
    `You travel to ${destination.name}.\n${destination.description}\nPort authority: ${factionName(destination.governingFaction)}.`
  );
}

function endTurn(): void {
  advanceTurn(`You remain docked at ${currentLocation().name} and collect routine contract payouts.`);
}

function showLedger(): void {
  const lines = factionIds
    .map((factionId) => {
      return `${factionName(factionId)} | ${diplomacy[factionId].relationship} | ${allianceLabel(diplomacy[factionId].alliance)}`;
    })
    .join('\n');

  log(`UNIVERSE LEDGER\n${lines}`);
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

  if (pendingEvent && !['status', 'relations', 'clear', 'ledger', 'market', 'tab'].includes(action)) {
    resolvePendingEvent(normalizedCommand);
    render();
    return;
  }

  if (action === 'status') {
    showStatus();
  } else if (action === 'market') {
    activeSidebarTab = 'market';
    showMarket();
  } else if (action === 'relations') {
    showRelations();
  } else if (action === 'ledger') {
    activeSidebarTab = 'ledger';
    showLedger();
  } else if (action === 'tab') {
    if (parts[1] === 'ledger') activeSidebarTab = 'ledger';
    if (parts[1] === 'market') activeSidebarTab = 'market';
    if (parts[1] === 'bargain') activeSidebarTab = 'bargain';
  } else if (action === 'vendor') {
    selectVendor(parts[1] ?? '');
    return;
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
  } else if (action === 'bargain') {
    showBargainingHelp();
  } else if (action === 'offer' || action === 'negotiate' || action === 'trade') {
    void submitFreeformBargainingMessage(command);
  } else if (action === 'end') {
    endTurn();
  } else if (action === 'clear') {
    logEl.innerHTML = '';
  } else if (activeSidebarTab === 'bargain') {
    void submitFreeformBargainingMessage(command);
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

selectedVendorId = locations[player.locationId].vendors[0].id;

log('You wake in the cargo bay of a small merchant ship.');
log('The docking lights of Vega Station flicker beyond the viewport.');
log('Every port now hosts multiple named vendors with their own factions, price spreads, and loyalties.');
log('Buy prices are always higher than sell prices. Profit now depends on planning cargo, timing, and faction relationships.');
log('Each turn awards credits only. Keep food, water, and fuel above their reserve lines.');
log('At the start of each round, there is a 50% chance of a random event and a 10% chance of a special market offer.');

render();
