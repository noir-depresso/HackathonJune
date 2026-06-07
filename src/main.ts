import './style.css';
import bargainingFactions from './data/factions.json';
import marketGoods from './data/marketGoods.json';
import marketLocations from './data/marketLocations.json';
import marketSupplies from './data/marketSupplies.json';
import territoryData from './data/territories.json';
import {
  generateBargainingAIMessage,
  generateFactionChatMessage,
  requestStructuredBargainingIntent,
} from './game/bargainingAI';
import type { FactionConversationMemory } from './game/bargainingAI';
import { formatBundle, formatResourceName, generateDialogue } from './game/dialogue';
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

type GoodId = keyof typeof marketGoods;
type SupplyId = keyof typeof marketSupplies;
type TradeItemId = GoodId | SupplyId;
type LocationId = keyof typeof marketLocations;
type StockId = 'vega_credit' | 'sirius_ore' | 'nova_life' | 'caravan_lux' | 'dust_salvage';
type FactionId =
  | 'vega_exchange'
  | 'sirius_guild'
  | 'nova_relief'
  | 'free_caravans'
  | 'dust_runners';
type AllianceStatus = 'none' | 'trade_pact' | 'alliance';
type FactionStance = 'ally' | 'friendly' | 'neutral' | 'rival' | 'hostile';
type SidebarTab = 'market' | 'ledger' | 'bargain';
type LogTab = 'conversation' | 'account' | 'stocks' | 'property' | 'map';
type CommandMode = 'root' | 'bargainTargets';
type StockLeverage = 1 | 2 | 3;
type PropertyOwner = 'player' | BargainFactionId;
type TerritoryType = 'mining' | 'logistics' | 'water';

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

type Stock = {
  id: StockId;
  symbol: string;
  name: string;
  sector: string;
  basePrice: number;
  price: number;
  drift: number;
  volatility: number;
  history: number[];
};

type StockPosition = {
  shares: number;
  averagePrice: number;
  averageLeverage: number;
};

type Territory = {
  name: string;
  owner: PropertyOwner;
  type: TerritoryType;
  basePrice: number;
  resourceOutput: Record<string, number>;
  strategicValue: number;
  isForSale: boolean;
  leaseAllowed: boolean;
  isLeased?: boolean;
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

const goods = marketGoods as Record<GoodId, Good>;
const supplies = marketSupplies as Record<SupplyId, Supply>;

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

const locations = marketLocations as unknown as Record<LocationId, Location>;

/*
const previousInlineLocations: Record<LocationId, Location> = {
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
*/

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

const stocks: Record<StockId, Stock> = {
  vega_credit: {
    id: 'vega_credit',
    symbol: 'VCI',
    name: 'Vega Credit Index',
    sector: 'Banking and licensed trade',
    basePrice: 86,
    price: 86,
    drift: 0.004,
    volatility: 0.035,
    history: [86],
  },
  sirius_ore: {
    id: 'sirius_ore',
    symbol: 'SOT',
    name: 'Sirius Ore Trust',
    sector: 'Mining and refinery contracts',
    basePrice: 134,
    price: 134,
    drift: 0.003,
    volatility: 0.045,
    history: [134],
  },
  nova_life: {
    id: 'nova_life',
    symbol: 'NLF',
    name: 'Nova Lifeline Fund',
    sector: 'Medicine, food, and water logistics',
    basePrice: 62,
    price: 62,
    drift: 0.002,
    volatility: 0.032,
    history: [62],
  },
  caravan_lux: {
    id: 'caravan_lux',
    symbol: 'CLX',
    name: 'Caravan Luxuries',
    sector: 'Star silk and rare goods',
    basePrice: 218,
    price: 218,
    drift: 0.003,
    volatility: 0.052,
    history: [218],
  },
  dust_salvage: {
    id: 'dust_salvage',
    symbol: 'DSP',
    name: 'Dust Salvage Pool',
    sector: 'Scrap, salvage, and black-route risk',
    basePrice: 41,
    price: 41,
    drift: 0.001,
    volatility: 0.06,
    history: [41],
  },
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
  dailyContact?: {
    day: number;
    factionId: BargainFactionId;
  };
} = {
  selectedFactionId: 'vega_union',
  message: 'Open a faction channel, chat, or offer concrete terms.',
};

const factionIds = Object.keys(factions) as FactionId[];
const stockIds = Object.keys(stocks) as StockId[];
const territories = structuredClone(territoryData) as Record<string, Territory>;
const territoryIds = Object.keys(territories);

let gameOver = false;
let gameOverReason = '';
let pendingEvent: PendingEvent | null = null;
let activeSpecial: MarketSpecial | null = null;
let activeSidebarTab: SidebarTab = 'market';
let activeLogTab: LogTab = 'conversation';
let infoScreenOpen = false;
let accountScreenOpen = false;
let selectedVendorId: string | null = null;
let stockLeverage: StockLeverage = 1;
let commandMode: CommandMode = 'root';
const conversationEntries: string[] = [];
const accountEntries: string[] = [];
const stockPositions: Partial<Record<StockId, StockPosition>> = {};
const factionConversationMemory: Record<BargainFactionId, FactionConversationMemory> = {
  vega_union: { recent: [], mood: 'new contact', repeatedTopic: '', repeatCount: 0, anger: 0 },
  eclipse_combine: { recent: [], mood: 'new contact', repeatedTopic: '', repeatCount: 0, anger: 0 },
  nova_frontier: { recent: [], mood: 'new contact', repeatedTopic: '', repeatCount: 0, anger: 0 },
};
const stockMarketBias: Record<StockId, number> = {
  vega_credit: 0,
  sirius_ore: 0,
  nova_life: 0,
  caravan_lux: 0,
  dust_salvage: 0,
};

const propertyOwnerMainFaction: Record<BargainFactionId, FactionId> = {
  vega_union: 'vega_exchange',
  eclipse_combine: 'sirius_guild',
  nova_frontier: 'nova_relief',
};

const locationMapPositions: Record<LocationId, { x: number; y: number }> = {
  vega: { x: 140, y: 92 },
  sirius: { x: 410, y: 112 },
  nova7: { x: 275, y: 270 },
} as Record<LocationId, { x: number; y: number }>;

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
          <h2 id="network-title">NETWORK</h2>
          <div class="tab-row">
            <button id="tab-market" class="tab-button">MARKET</button>
            <button id="tab-ledger" class="tab-button">LEDGER</button>
            <button id="tab-bargain" class="tab-button">BARGAIN</button>
            <button id="tab-stocks" class="tab-button">STOCKS</button>
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
        <input id="manual-input" placeholder="type command, e.g. buy ore 1, vendor nova-vessa, gift 120" autocomplete="off" />
      </form>
    </footer>
  </div>

  <div class="hidden-controls" aria-hidden="true">
    <button id="info-button" type="button"></button>
    <button id="log-tab-conversation" type="button"></button>
    <button id="log-tab-account" type="button"></button>
    <button id="log-tab-stocks" type="button"></button>
  </div>

  <section id="info-screen" class="info-screen hidden" aria-hidden="true">
    <div class="info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
      <div class="info-panel-header">
        <h1 id="info-title">How To Play</h1>
        <button id="info-close" class="info-close-button" type="button" aria-label="Close information screen">X</button>
      </div>

      <div class="info-panel-body">
        <section>
          <h2>Goal</h2>
          <p>Survive as a small merchant ship by managing credits, supplies, cargo, routes, vendors, factions, and negotiated deals.</p>
        </section>

        <section>
          <h2>Core Loop</h2>
          <ul>
            <li>Buy supplies or trade goods from the current vendor.</li>
            <li>Sell cargo where the bid price is better than what you paid.</li>
            <li>Travel between ports, spending fuel and advancing the day.</li>
            <li>Keep food, water, and fuel above reserve lines or the run can collapse.</li>
          </ul>
        </section>

        <section>
          <h2>Interface</h2>
          <ul>
            <li>COMMS shows story, chat, events, and negotiation messages.</li>
            <li>ACCOUNT records every mechanical change: credits, cargo, supplies, reputation, alliances, and completed bargains.</li>
            <li>STOCKS shows market prices, line graphs, daily gains/losses, portfolio value, and buy/sell controls.</li>
            <li>PROPERTY manages territory holdings, leases, and daily strategic income.</li>
            <li>MAP shows known routes and lets you travel to connected ports.</li>
            <li>MARKET selects vendors and shows prices. LEDGER shows faction politics. BARGAIN opens faction negotiation.</li>
          </ul>
        </section>

        <section>
          <h2>Stocks</h2>
          <ul>
            <li>Each stock has its own base price, drift, volatility, and sector.</li>
            <li>Prices update every day from random movement, faction reputation, events, and player trade actions.</li>
            <li>Use leverage carefully. Higher leverage lowers entry cost, but profit and loss are magnified when selling.</li>
          </ul>
        </section>

        <section>
          <h2>Bargaining</h2>
          <ul>
            <li>You can chat naturally in the BARGAIN tab, but factions stay in character and will not obey out-of-world requests.</li>
            <li>Concrete deals can be item for item, credits for item, item for credits, or mixed bundles.</li>
            <li>The game audits the real inventories and detects impossible claims. False claims hurt trust and reputation.</li>
            <li>Accepted natural-language deals apply immediately. Counteroffers wait for Accept Counter.</li>
          </ul>
        </section>

        <section>
          <h2>Useful Commands</h2>
          <p>Try: status, market, ledger, stocks, property list, map, bargain, buy ore 1, sell ore 1, stock buy vega_credit 1, leverage 2, vendor vega-vanto, gift 100, travel sirius, end.</p>
          <p>Natural offer example: I offer Nova 500 credits for 10 fuel as humanitarian support.</p>
        </section>
      </div>
    </div>
  </section>

  <section id="account-screen" class="info-screen hidden" aria-hidden="true">
    <div class="info-panel account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title">
      <div class="info-panel-header">
        <h1 id="account-title">Account Log</h1>
        <button id="account-close" class="info-close-button" type="button" aria-label="Close account log">X</button>
      </div>
      <div id="account-log-body" class="info-panel-body account-log-body"></div>
    </div>
  </section>
`;

const logEl = document.querySelector<HTMLDivElement>('#log')!;
const statusEl = document.querySelector<HTMLDivElement>('#status')!;
const inventoryEl = document.querySelector<HTMLDivElement>('#inventory')!;
const networkPanelEl = document.querySelector<HTMLDivElement>('#network-panel')!;
const networkTitleEl = document.querySelector<HTMLHeadingElement>('#network-title')!;
const diplomacyEl = document.querySelector<HTMLDivElement>('#diplomacy')!;
const commandsEl = document.querySelector<HTMLDivElement>('#commands')!;
const headerLocationEl = document.querySelector<HTMLDivElement>('#header-location')!;
const headerDayEl = document.querySelector<HTMLSpanElement>('#header-day')!;
const manualForm = document.querySelector<HTMLFormElement>('#manual-form')!;
const manualInput = document.querySelector<HTMLInputElement>('#manual-input')!;
const tabMarketButton = document.querySelector<HTMLButtonElement>('#tab-market')!;
const tabLedgerButton = document.querySelector<HTMLButtonElement>('#tab-ledger')!;
const tabBargainButton = document.querySelector<HTMLButtonElement>('#tab-bargain')!;
const tabStocksButton = document.querySelector<HTMLButtonElement>('#tab-stocks')!;
const logTabConversationButton = document.querySelector<HTMLButtonElement>('#log-tab-conversation')!;
const logTabAccountButton = document.querySelector<HTMLButtonElement>('#log-tab-account')!;
const logTabStocksButton = document.querySelector<HTMLButtonElement>('#log-tab-stocks')!;
const infoButton = document.querySelector<HTMLButtonElement>('#info-button')!;
const infoCloseButton = document.querySelector<HTMLButtonElement>('#info-close')!;
const infoScreenEl = document.querySelector<HTMLElement>('#info-screen')!;
const accountCloseButton = document.querySelector<HTMLButtonElement>('#account-close')!;
const accountScreenEl = document.querySelector<HTMLElement>('#account-screen')!;
const accountLogBodyEl = document.querySelector<HTMLDivElement>('#account-log-body')!;

tabMarketButton.addEventListener('click', () => {
  activeLogTab = 'conversation';
  activeSidebarTab = 'market';
  render();
});

tabLedgerButton.addEventListener('click', () => {
  activeLogTab = 'conversation';
  activeSidebarTab = 'ledger';
  render();
});

tabBargainButton.addEventListener('click', () => {
  activeLogTab = 'conversation';
  bargainingState.selectedFactionId = factionToBargainFaction[currentVendor().factionId];
  activeSidebarTab = 'bargain';
  render();
});

tabStocksButton.addEventListener('click', () => {
  commandMode = 'root';
  activeLogTab = 'stocks';
  render();
});

logTabConversationButton.addEventListener('click', () => {
  activeLogTab = 'conversation';
  renderLogPanel();
});

logTabAccountButton.addEventListener('click', () => {
  activeLogTab = 'account';
  renderLogPanel();
});

logTabStocksButton.addEventListener('click', () => {
  activeLogTab = 'stocks';
  renderLogPanel();
});

infoButton.addEventListener('click', () => {
  infoScreenOpen = true;
  renderInfoScreen();
});

infoCloseButton.addEventListener('click', () => {
  infoScreenOpen = false;
  renderInfoScreen();
});

infoScreenEl.addEventListener('click', (event) => {
  if (event.target === infoScreenEl) {
    infoScreenOpen = false;
    renderInfoScreen();
  }
});

accountCloseButton.addEventListener('click', () => {
  accountScreenOpen = false;
  renderAccountScreen();
});

accountScreenEl.addEventListener('click', (event) => {
  if (event.target === accountScreenEl) {
    accountScreenOpen = false;
    renderAccountScreen();
  }
});

function currentLocation(): Location {
  return locations[player.locationId];
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
  const inventory: BargainInventory = {
    credits: player.credits,
    water: player.supplies.water,
    fuel_cells: player.supplies.fuel,
  };

  for (const goodId of Object.keys(goods) as GoodId[]) {
    inventory[goodId as ResourceId] = player.cargo[goodId] ?? 0;
  }

  return inventory;
}

function factionForNegotiation(factionId: BargainFactionId): BargainFaction {
  const faction = structuredClone(factionStates[factionId]) as BargainFaction;
  applyAngerToNegotiationFaction(factionId, faction);
  return faction;
}

function factionStatesForNegotiation(): Record<BargainFactionId, BargainFaction> {
  const states = structuredClone(factionStates) as Record<BargainFactionId, BargainFaction>;

  for (const factionId of Object.keys(states) as BargainFactionId[]) {
    applyAngerToNegotiationFaction(factionId, states[factionId]);
  }

  return states;
}

function applyAngerToNegotiationFaction(factionId: BargainFactionId, faction: BargainFaction): void {
  const anger = factionConversationMemory[factionId].anger;

  if (anger <= 0) {
    return;
  }

  faction.relationshipWithPlayer = clampNumber(
    faction.relationshipWithPlayer - Math.floor(anger / 5),
    -100,
    100
  );
  faction.trust = clampNumber(faction.trust - Math.floor(anger / 4), 0, 100);
  faction.greed = Math.round((faction.greed + anger / 150) * 100) / 100;
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

function angerMoodLabel(anger: number): string {
  if (anger >= 85) return 'furious';
  if (anger >= 65) return 'angry';
  if (anger >= 40) return 'irritated';
  if (anger >= 18) return 'wary';
  return 'steady';
}

function dailyContactFactionName(): string {
  const contact = bargainingState.dailyContact;

  if (!contact || contact.day !== player.day) {
    return 'None';
  }

  return factionStates[contact.factionId].name;
}

function registerBargainingContact(factionId: BargainFactionId): boolean {
  const contact = bargainingState.dailyContact;

  if (contact && contact.day === player.day && contact.factionId !== factionId) {
    const lockedFactionName = factionStates[contact.factionId].name;
    const attemptedFactionName = factionStates[factionId].name;
    const message = `Daily diplomacy channel already used with ${lockedFactionName}. End the day before contacting ${attemptedFactionName}.`;

    bargainingState.selectedFactionId = contact.factionId;
    bargainingState.pendingOffer = undefined;
    bargainingState.pendingResult = undefined;
    bargainingState.message = message;
    log(message);
    return false;
  }

  bargainingState.dailyContact = {
    day: player.day,
    factionId,
  };
  return true;
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  const before = diplomacy[factionId].relationship;
  diplomacy[factionId].relationship = Math.max(-100, Math.min(100, diplomacy[factionId].relationship + change));
  const after = diplomacy[factionId].relationship;

  if (change !== 0 && before !== after) {
    accountLog(`REPUTATION | ${factionName(factionId)}: ${before} -> ${after} (${after - before > 0 ? '+' : ''}${after - before})`);
  }
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

function stockLabel(stockId: StockId): string {
  const stock = stocks[stockId];
  return `${stock.symbol} (${stock.name})`;
}

function influenceStock(stockId: StockId, percent: number): void {
  stockMarketBias[stockId] += percent;
}

function stockForFaction(factionId: FactionId): StockId {
  const stockMap: Record<FactionId, StockId> = {
    vega_exchange: 'vega_credit',
    sirius_guild: 'sirius_ore',
    nova_relief: 'nova_life',
    free_caravans: 'caravan_lux',
    dust_runners: 'dust_salvage',
  };

  return stockMap[factionId];
}

function influenceFactionStocks(factionId: FactionId, percent: number): void {
  influenceStock(stockForFaction(factionId), percent);
}

function stockForGood(goodId: GoodId): StockId {
  const stockMap: Record<GoodId, StockId> = {
    medicine: 'nova_life',
    ore: 'sirius_ore',
    star_silk: 'caravan_lux',
    alien_relics: 'dust_salvage',
    quantum_cores: 'vega_credit',
    biogel: 'nova_life',
    void_crystals: 'dust_salvage',
    drone_parts: 'sirius_ore',
    spice: 'caravan_lux',
  };

  return stockMap[goodId];
}

function stockForTradeItem(itemId: TradeItemId | ResourceId): StockId {
  if (itemId === 'food' || itemId === 'water') return 'nova_life';
  if (itemId === 'fuel' || itemId === 'fuel_cells') return 'sirius_ore';
  return stockForGood(itemId as GoodId);
}

function influenceBundleStocks(bundle: ResourceBundle, direction: 1 | -1): void {
  for (const [resourceId, amount] of Object.entries(bundle)) {
    if (resourceId === 'credits' || amount <= 0) {
      continue;
    }

    influenceStock(stockForTradeItem(resourceId as TradeItemId), direction * Math.min(0.014, amount / 800));
  }
}

function stockPortfolioValue(): number {
  return stockIds.reduce((total, stockId) => total + stockPositionValue(stockId), 0);
}

function stockPositionValue(stockId: StockId): number {
  const position = stockPositions[stockId];

  if (!position) {
    return 0;
  }

  const margin = (position.averagePrice * position.shares) / position.averageLeverage;
  const leveragedProfit = (stocks[stockId].price - position.averagePrice) * position.shares * position.averageLeverage;
  return Math.max(0, Math.round(margin + leveragedProfit));
}

function stockDayChange(stockId: StockId): number {
  const history = stocks[stockId].history;

  if (history.length < 2) {
    return 0;
  }

  return stocks[stockId].price - history[history.length - 2];
}

function stockDayChangePercent(stockId: StockId): number {
  const history = stocks[stockId].history;

  if (history.length < 2) {
    return 0;
  }

  const previous = history[history.length - 2];
  return previous === 0 ? 0 : ((stocks[stockId].price - previous) / previous) * 100;
}

function applyStockMarketTurn(): void {
  const changes: string[] = [];

  for (const stockId of stockIds) {
    const stock = stocks[stockId];
    const before = stock.price;
    const randomMove = (Math.random() * 2 - 1) * stock.volatility;
    const relationshipSupport = stockRelationshipSupport(stockId);
    const bias = stockMarketBias[stockId];
    const rawPercent = stock.drift + randomMove + relationshipSupport + bias;
    const clampedPercent = Math.max(-0.075, Math.min(0.075, rawPercent));

    stock.price = Math.max(4, Math.round(stock.price * (1 + clampedPercent)));
    stock.history.push(stock.price);

    if (stock.history.length > 18) {
      stock.history.shift();
    }

    stockMarketBias[stockId] = 0;
    changes.push(`${stock.symbol} ${before} -> ${stock.price} (${formatSignedPercent(clampedPercent * 100)})`);
  }

  accountLog(`STOCK MARKET | ${changes.join('; ')}.`);
}

function buyStock(stockIdText: string, amountText: string): void {
  const stockId = stockIdText as StockId;
  const shares = Number(amountText);
  const stock = stocks[stockId];

  if (!stock || !Number.isInteger(shares) || shares <= 0) {
    log('Invalid stock purchase. Example: stock buy vega_credit 2');
    return;
  }

  const cost = Math.ceil((stock.price * shares) / stockLeverage);

  if (player.credits < cost) {
    log(`Not enough credits. Need ${cost} credits for ${shares} ${stock.symbol} at ${stockLeverage}x.`);
    return;
  }

  const beforeCredits = player.credits;
  const current = stockPositions[stockId];
  player.credits -= cost;

  if (current) {
    const totalShares = current.shares + shares;
    current.averagePrice = Math.round(((current.averagePrice * current.shares) + (stock.price * shares)) / totalShares);
    current.averageLeverage = Math.round((((current.averageLeverage * current.shares) + (stockLeverage * shares)) / totalShares) * 10) / 10;
    current.shares = totalShares;
  } else {
    stockPositions[stockId] = {
      shares,
      averagePrice: stock.price,
      averageLeverage: stockLeverage,
    };
  }

  influenceStock(stockId, shares > 5 ? 0.006 : 0.003);
  log(`Bought ${shares} ${stock.symbol} shares at ${stock.price} credits using ${stockLeverage}x leverage.`);
  accountLog(`STOCK BUY | ${shares} ${stockLabel(stockId)}. Credits ${beforeCredits} -> ${player.credits}. Cost ${cost}.`);
}

function sellStock(stockIdText: string, amountText: string): void {
  const stockId = stockIdText as StockId;
  const shares = Number(amountText);
  const stock = stocks[stockId];
  const position = stockPositions[stockId];

  if (!stock || !position || !Number.isInteger(shares) || shares <= 0) {
    log('Invalid stock sale. Example: stock sell vega_credit 1');
    return;
  }

  if (position.shares < shares) {
    log(`You only hold ${position.shares} ${stock.symbol} shares.`);
    return;
  }

  const beforeCredits = player.credits;
  const returnedMargin = (position.averagePrice * shares) / position.averageLeverage;
  const leveragedProfit = (stock.price - position.averagePrice) * shares * position.averageLeverage;
  const payout = Math.max(0, Math.round(returnedMargin + leveragedProfit));

  player.credits += payout;
  position.shares -= shares;

  if (position.shares <= 0) {
    delete stockPositions[stockId];
  }

  influenceStock(stockId, shares > 5 ? -0.006 : -0.003);
  log(`Sold ${shares} ${stock.symbol} shares at ${stock.price}. Payout: ${payout} credits.`);
  accountLog(`STOCK SELL | ${shares} ${stockLabel(stockId)}. Credits ${beforeCredits} -> ${player.credits}. Payout ${payout}.`);
}

function setStockLeverage(valueText: string): void {
  const value = Number(valueText);

  if (value !== 1 && value !== 2 && value !== 3) {
    log('Invalid leverage. Use: leverage 1, leverage 2, or leverage 3.');
    return;
  }

  stockLeverage = value;
  log(`Stock leverage set to ${stockLeverage}x. Higher leverage lowers entry cost but magnifies losses on sale.`);
}

function stockRelationshipSupport(stockId: StockId): number {
  const factionMap: Record<StockId, FactionId> = {
    vega_credit: 'vega_exchange',
    sirius_ore: 'sirius_guild',
    nova_life: 'nova_relief',
    caravan_lux: 'free_caravans',
    dust_salvage: 'dust_runners',
  };
  const relationship = diplomacy[factionMap[stockId]].relationship;
  return Math.max(-0.012, Math.min(0.012, relationship / 10000));
}

function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function specialBadge(vendorId: string, itemId: TradeItemId): string {
  if (!activeSpecial || activeSpecial.vendorId !== vendorId || activeSpecial.itemId !== itemId) {
    return '';
  }

  return activeSpecial.type === 'discount' ? 'FLASH SALE' : 'HIGH DEMAND';
}

function territoryTypeLabel(type: TerritoryType): string {
  if (type === 'mining') return 'Mining Claim';
  if (type === 'logistics') return 'Logistics Depot';
  return 'Water Rights';
}

function propertyOwnerLabel(owner: PropertyOwner): string {
  if (owner === 'player') return 'You';
  return factionStates[owner]?.name ?? owner;
}

function resourceOutputLabel(output: Record<string, number>): string {
  return Object.entries(output)
    .map(([resourceId, amount]) => `${resourceId.replaceAll('_', ' ')} +${amount}`)
    .join(', ');
}

function territoryMaintenance(territory: Territory): number {
  const leaseCost = territory.isLeased ? 12 : 0;
  return Math.max(1, Math.round(territory.basePrice * 0.035) + leaseCost);
}

function territoryGrossIncome(territory: Territory): number {
  const leaseBoost = territory.isLeased ? 1.2 : 1;
  return Math.round(territory.strategicValue * leaseBoost);
}

function territoryNetIncome(territory: Territory): number {
  return territoryGrossIncome(territory) - territoryMaintenance(territory);
}

function propertyIncomePerTurn(): number {
  return territoryIds.reduce((total, territoryId) => {
    const territory = territories[territoryId];
    return territory.owner === 'player' ? total + territoryNetIncome(territory) : total;
  }, 0);
}

function incomePerTurn(): number {
  return 120 + countAlliances('trade_pact') * 25 + countAlliances('alliance') * 60 + propertyIncomePerTurn();
}

function showPropertyList(): void {
  activeLogTab = 'property';
  renderPropertyPanel();
}

function inspectProperty(territoryId: string): void {
  const territory = territories[territoryId];

  if (!territory) {
    log(`Property not found: ${territoryId}`);
    return;
  }

  activeLogTab = 'conversation';
  log(
    `PROPERTY REPORT - ${territory.name}
Type: ${territoryTypeLabel(territory.type)}
Owner: ${propertyOwnerLabel(territory.owner)}
Price: ${territory.basePrice}
Strategic value: ${territory.strategicValue}
Gross income: ${territoryGrossIncome(territory)}
Maintenance: ${territoryMaintenance(territory)}
Net income: ${territoryNetIncome(territory)}
Output: ${resourceOutputLabel(territory.resourceOutput)}
For sale: ${territory.isForSale ? 'Yes' : 'No'}
Lease allowed: ${territory.leaseAllowed ? 'Yes' : 'No'}
Leased: ${territory.isLeased ? 'Yes' : 'No'}`
  );
}

function buyProperty(territoryId: string): void {
  const territory = territories[territoryId];

  if (!territory) {
    log(`Property not found: ${territoryId}`);
    return;
  }

  if (!territory.isForSale) {
    log(`${territory.name} is not for sale right now.`);
    return;
  }

  if (territory.owner === 'player') {
    log(`You already own ${territory.name}.`);
    return;
  }

  if (player.credits < territory.basePrice) {
    log(`Not enough credits to buy ${territory.name}. Need ${territory.basePrice}.`);
    return;
  }

  const beforeCredits = player.credits;
  const previousOwner = territory.owner;
  player.credits -= territory.basePrice;
  territory.owner = 'player';
  territory.isForSale = false;
  influenceStock(stockForPropertyOwner(previousOwner), -0.004);
  accountLog(`PROPERTY BUY | ${territory.name}. Credits ${beforeCredits} -> ${player.credits}.`);
  log(`You bought ${territory.name} for ${territory.basePrice} credits.`);
  renderPropertyPanel();
}

function sellProperty(territoryId: string): void {
  const territory = territories[territoryId];

  if (!territory) {
    log(`Property not found: ${territoryId}`);
    return;
  }

  if (territory.owner !== 'player') {
    log(`You do not own ${territory.name}.`);
    return;
  }

  const beforeCredits = player.credits;
  const salePrice = Math.max(1, Math.round(territory.basePrice * 0.8));
  player.credits += salePrice;
  territory.owner = 'vega_union';
  territory.isForSale = true;
  territory.isLeased = false;
  influenceStock('vega_credit', 0.004);
  accountLog(`PROPERTY SELL | ${territory.name}. Credits ${beforeCredits} -> ${player.credits}.`);
  log(`You sold ${territory.name} for ${salePrice} credits.`);
  renderPropertyPanel();
}

function leaseProperty(territoryId: string): void {
  const territory = territories[territoryId];

  if (!territory) {
    log(`Property not found: ${territoryId}`);
    return;
  }

  if (territory.owner !== 'player') {
    log(`You do not own ${territory.name}.`);
    return;
  }

  if (!territory.leaseAllowed) {
    log(`${territory.name} cannot be leased right now.`);
    return;
  }

  if (territory.isLeased) {
    log(`${territory.name} is already leased.`);
    return;
  }

  territory.isLeased = true;
  accountLog(`PROPERTY LEASE | ${territory.name}. Expected net income now ${territoryNetIncome(territory)} per day.`);
  log(`You leased ${territory.name}; yield rises, but maintenance increases too.`);
  renderPropertyPanel();
}

function releaseProperty(territoryId: string): void {
  const territory = territories[territoryId];

  if (!territory) {
    log(`Property not found: ${territoryId}`);
    return;
  }

  if (territory.owner !== 'player') {
    log(`You do not own ${territory.name}.`);
    return;
  }

  if (!territory.isLeased) {
    log(`${territory.name} is not leased.`);
    return;
  }

  territory.isLeased = false;
  accountLog(`PROPERTY RELEASE | ${territory.name}. Expected net income now ${territoryNetIncome(territory)} per day.`);
  log(`You released the lease on ${territory.name}.`);
  renderPropertyPanel();
}

function stockForPropertyOwner(owner: PropertyOwner): StockId {
  if (owner === 'player') return 'vega_credit';
  return stockForFaction(propertyOwnerMainFaction[owner]);
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
          influenceFactionStocks(first, 0.018);
          influenceFactionStocks(second, -0.016);
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
          influenceFactionStocks(second, 0.018);
          influenceFactionStocks(first, -0.016);
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
          influenceFactionStocks(first, -0.004);
          influenceFactionStocks(second, -0.004);
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
          influenceFactionStocks(first, 0.014);
          influenceFactionStocks(second, -0.012);
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
          influenceFactionStocks(second, 0.014);
          influenceFactionStocks(first, -0.012);
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
          influenceStock('vega_credit', 0.006);
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
          influenceFactionStocks(first, 0.018);
          influenceStock('nova_life', 0.012);
          influenceFactionStocks(second, -0.006);
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
          influenceFactionStocks(second, 0.018);
          influenceStock('nova_life', 0.012);
          influenceFactionStocks(first, -0.006);
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
          influenceStock('nova_life', -0.018);
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
      influenceFactionStocks(factionId, 0.016);
      influenceStock('dust_salvage', 0.02);
      log(
        `GOOD EVENT - SALVAGE BEACON\nYou recover a legal salvage cache and turn it in cleanly.\nCredits +180, and ${factionName(factionId)} notes your honesty.`
      );
    },
    () => {
      gainSupply('food', 3);
      gainSupply('water', 3);
      gainSupply('fuel', 8);
      influenceStock('nova_life', 0.016);
      influenceStock('vega_credit', 0.008);
      log(
        'GOOD EVENT - RELIEF CONVOY\nA passing convoy tops up your essentials.\nFood +3, water +3, fuel +8.'
      );
    },
    () => {
      const goodId = randomPick(Object.keys(goods) as GoodId[]);
      gainCargo(goodId, 2);
      player.credits += 70;
      influenceStock(stockForGood(goodId), 0.018);
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
      influenceStock('nova_life', -0.018);
      log(
        `BAD EVENT - HULL BREACH\nA seal failure spoils your stores.\nFood -${foodLost}, water -${waterLost}.`
      );
    },
    () => {
      const creditsLost = loseCredits(160);
      influenceStock('vega_credit', -0.018);
      influenceStock('dust_salvage', 0.014);
      log(
        `BAD EVENT - PIRATE TOLL\nAn outlaw checkpoint strips value from your hold.\nCredits -${creditsLost}.`
      );
    },
    () => {
      const fuelLost = loseSupply('fuel', 10);
      const factionId = randomFaction();
      adjustRelationship(factionId, -8);
      influenceFactionStocks(factionId, -0.014);
      influenceStock('sirius_ore', -0.01);
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

  const beforeCredits = player.credits;
  const beforeSupplies = { ...player.supplies };
  const income = incomePerTurn();
  player.day += 1;
  bargainingState.dailyContact = undefined;
  player.credits += income;
  consumeSupplies();

  log(
    `${summary}\nTurn income: ${income} credits.\nSupplies consumed: food -2, water -2, fuel -1.`
  );
  accountLog(
    `TURN ${player.day} | Credits ${beforeCredits} -> ${player.credits} (+${income}). Supplies food ${beforeSupplies.food} -> ${player.supplies.food}, water ${beforeSupplies.water} -> ${player.supplies.water}, fuel ${beforeSupplies.fuel} -> ${player.supplies.fuel}.`
  );

  maybeTriggerRandomEvent();
  maybeRollSpecialOffer();
  applyStockMarketTurn();
  checkGameOver();
}

function log(message: string): void {
  conversationEntries.push(message);
  renderLogPanel();
}

function accountLog(message: string): void {
  accountEntries.push(message);
  if (accountScreenOpen) {
    renderAccountScreen();
  }
}

function renderLogPanel(): void {
  logTabConversationButton.className = activeLogTab === 'conversation' ? 'tab-button active-tab' : 'tab-button';
  logTabAccountButton.className = activeLogTab === 'account' ? 'tab-button active-tab' : 'tab-button';
  logTabStocksButton.className = activeLogTab === 'stocks' ? 'tab-button active-tab' : 'tab-button';

  if (activeLogTab === 'stocks') {
    renderStockMarketPanel();
    return;
  }

  if (activeLogTab === 'property') {
    renderPropertyPanel();
    return;
  }

  if (activeLogTab === 'map') {
    renderMapPanel();
    return;
  }

  const entries = activeLogTab === 'conversation' ? conversationEntries : accountEntries;
  logEl.innerHTML = entries
    .map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`)
    .join('');
  logEl.scrollTop = logEl.scrollHeight;
}

function renderStockMarketPanel(): void {
  const rows = stockIds
    .map((stockId) => {
      const stock = stocks[stockId];
      const position = stockPositions[stockId];
      const change = stockDayChange(stockId);
      const changePercent = stockDayChangePercent(stockId);
      const changeClass = change >= 0 ? 'stock-up' : 'stock-down';
      const held = position?.shares ?? 0;
      const value = stockPositionValue(stockId);
      const graph = renderStockGraph(stock);
      const buyOneCost = Math.ceil(stock.price / stockLeverage);
      const buyFiveCost = Math.ceil((stock.price * 5) / stockLeverage);

      return `
        <article class="stock-row">
          <div class="stock-identity">
            <div class="stock-symbol">${stock.symbol}</div>
            <div>
              <div class="stock-name">${stock.name}</div>
              <div class="stock-sector">${stock.sector}</div>
            </div>
          </div>
          <div class="stock-cell stock-price-block">
            <span class="stock-cell-label">Price</span>
            <strong>${stock.price}</strong>
          </div>
          <div class="stock-cell">
            <span class="stock-cell-label">Move</span>
            <strong class="${changeClass}">${change >= 0 ? '+' : ''}${change}</strong>
            <span class="${changeClass}">${formatSignedPercent(changePercent)}</span>
          </div>
          <div class="stock-cell">
            <span class="stock-cell-label">Owned</span>
            <strong>${held}</strong>
            <span>avg ${position ? position.averagePrice : '-'}</span>
          </div>
          <div class="stock-cell">
            <span class="stock-cell-label">Value</span>
            <strong>${value}</strong>
            <span>margin</span>
          </div>
          <div class="stock-sparkline">${graph}</div>
          <div class="stock-actions">
            <button class="stock-trade-button buy-button" data-command="stock buy ${stockId} 1">B1 <span>${buyOneCost}</span></button>
            <button class="stock-trade-button buy-button" data-command="stock buy ${stockId} 5">B5 <span>${buyFiveCost}</span></button>
            <button class="stock-trade-button sell-button" data-command="stock sell ${stockId} 1">S1</button>
            <button class="stock-trade-button sell-button" data-command="stock sell ${stockId} 5">S5</button>
          </div>
        </article>
      `;
    })
    .join('');

  logEl.innerHTML = `
    <div class="stock-market">
      <div class="stock-market-head">
        <div>
          <div class="box-subtitle">STOCK MARKET</div>
          <div class="ledger-copy">A compact exchange board for faction-linked equities. Prices move from market drift, volatility, reputation, events, travel, trade, and bargaining.</div>
        </div>
        <div class="stock-summary">
          <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
          <div class="stat-row"><span>Portfolio</span><strong>${stockPortfolioValue()}</strong></div>
          <div class="stat-row"><span>Leverage</span><strong>${stockLeverage}x</strong></div>
        </div>
      </div>
      <div class="leverage-row">
        <button class="tab-button ${stockLeverage === 1 ? 'active-tab' : ''}" data-command="leverage 1">1x</button>
        <button class="tab-button ${stockLeverage === 2 ? 'active-tab' : ''}" data-command="leverage 2">2x</button>
        <button class="tab-button ${stockLeverage === 3 ? 'active-tab' : ''}" data-command="leverage 3">3x</button>
      </div>
      <div class="stock-table-head">
        <span>Asset</span>
        <span>Price</span>
        <span>Move</span>
        <span>Owned</span>
        <span>Value</span>
        <span>History</span>
        <span>Trade</span>
      </div>
      <div class="stock-board">${rows}</div>
    </div>
  `;

  logEl.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      executeCommand(button.dataset.command ?? '');
    });
  });
}

function renderPropertyPanel(): void {
  const ownedTerritories = territoryIds
    .map((territoryId) => ({ id: territoryId, territory: territories[territoryId] }))
    .filter(({ territory }) => territory.owner === 'player');
  const availableTerritories = territoryIds
    .map((territoryId) => ({ id: territoryId, territory: territories[territoryId] }))
    .filter(({ territory }) => territory.owner !== 'player' && territory.isForSale);

  const ownedMarkup = ownedTerritories.length > 0
    ? ownedTerritories
        .map(({ id, territory }) => {
          const leasedBadge = territory.isLeased ? '<span class="property-badge warning">LEASED</span>' : '';
          return `
            <article class="property-card">
              <div class="property-head">
                <strong>${territory.name}</strong>
                <span class="property-badge">${territoryTypeLabel(territory.type)}</span>
                ${leasedBadge}
              </div>
              <div class="property-line">Output: ${resourceOutputLabel(territory.resourceOutput)}</div>
              <div class="property-line">Gross ${territoryGrossIncome(territory)} | Maint ${territoryMaintenance(territory)} | Net ${territoryNetIncome(territory)} / day</div>
              <div class="property-actions">
                <button class="property-action-button" data-command="property inspect ${id}">Inspect</button>
                ${territory.leaseAllowed && !territory.isLeased ? `<button class="property-action-button" data-command="property lease ${id}">Lease</button>` : ''}
                ${territory.isLeased ? `<button class="property-action-button" data-command="property release ${id}">Release</button>` : ''}
                <button class="property-action-button sell" data-command="property sell ${id}">Sell</button>
              </div>
            </article>
          `;
        })
        .join('')
    : '<div class="log-entry">No properties owned yet.</div>';

  const availableMarkup = availableTerritories.length > 0
    ? availableTerritories
        .map(({ id, territory }) => {
          return `
            <article class="property-card">
              <div class="property-head">
                <strong>${territory.name}</strong>
                <span class="property-badge">${territoryTypeLabel(territory.type)}</span>
              </div>
              <div class="property-line">Owner: ${propertyOwnerLabel(territory.owner)} | Price ${territory.basePrice} credits</div>
              <div class="property-line">Output: ${resourceOutputLabel(territory.resourceOutput)} | Net ${territoryNetIncome(territory)} / day</div>
              <div class="property-actions">
                <button class="property-action-button" data-command="property inspect ${id}">Inspect</button>
                <button class="property-action-button" data-command="property buy ${id}">Buy</button>
              </div>
            </article>
          `;
        })
        .join('')
    : '<div class="log-entry">No properties are currently for sale.</div>';

  logEl.innerHTML = `
    <div class="property-panel">
      <div class="stock-market-head">
        <div>
          <div class="box-subtitle">PROPERTY EXCHANGE</div>
          <div class="ledger-copy">Territory leases and strategic holdings add daily income without changing the current market, ledger, or bargaining screens.</div>
        </div>
        <div class="stock-summary">
          <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
          <div class="stat-row"><span>Owned</span><strong>${ownedTerritories.length}</strong></div>
          <div class="stat-row"><span>Net / Day</span><strong>${propertyIncomePerTurn()}</strong></div>
        </div>
      </div>
      <div class="box-subtitle property-section-title">OWNED HOLDINGS</div>
      <div class="property-list">${ownedMarkup}</div>
      <div class="box-subtitle property-section-title">FOR SALE</div>
      <div class="property-list">${availableMarkup}</div>
    </div>
  `;

  bindLogCommandButtons();
}

function renderMapPanel(): void {
  const locationIds = Object.keys(locations) as LocationId[];
  const routeLines = locationIds
    .flatMap((locationId) => {
      const start = locationMapPositions[locationId];

      return Object.keys(locations[locationId].routes)
        .filter((destinationId) => String(locationId) < destinationId)
        .map((destinationId) => {
          const end = locationMapPositions[destinationId as LocationId];
          if (!start || !end) return '';
          return `<line class="map-route" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />`;
        });
    })
    .join('');

  const nodes = locationIds
    .map((locationId) => {
      const location = locations[locationId];
      const point = locationMapPositions[locationId] ?? { x: 280, y: 180 };
      const current = locationId === player.locationId;
      const connected = currentLocation().routes[locationId] !== undefined;
      const command = current ? 'status' : connected ? `travel ${locationId}` : `map`;
      const label = current ? 'CURRENT' : connected ? `${currentLocation().routes[locationId]} FUEL` : 'LOCKED';

      return `
        <g class="map-node ${current ? 'current' : ''} ${connected ? 'connected' : ''}" data-command="${command}">
          <circle cx="${point.x}" cy="${point.y}" r="${current ? 18 : 14}" />
          <text x="${point.x}" y="${point.y - 25}" text-anchor="middle">${location.name}</text>
          <text x="${point.x}" y="${point.y + 34}" text-anchor="middle">${label}</text>
        </g>
      `;
    })
    .join('');

  const routeList = Object.entries(currentLocation().routes)
    .map(([destinationId, fuelCost]) => {
      const location = locations[destinationId as LocationId];
      return `
        <button class="property-action-button" data-command="travel ${destinationId}">
          Travel ${location.name} (${fuelCost} fuel)
        </button>
      `;
    })
    .join('');

  logEl.innerHTML = `
    <div class="map-panel">
      <div class="stock-market-head">
        <div>
          <div class="box-subtitle">ROUTE MAP</div>
          <div class="ledger-copy">A command-map view of known ports. Connected systems can be selected directly from the map or from the route buttons below.</div>
        </div>
        <div class="stock-summary">
          <div class="stat-row"><span>Current</span><strong>${currentLocation().name}</strong></div>
          <div class="stat-row"><span>Fuel</span><strong>${player.supplies.fuel}</strong></div>
        </div>
      </div>
      <div class="map-card">
        <svg class="route-map" viewBox="0 0 560 360" role="img" aria-label="Route map">
          <rect class="map-background" x="0" y="0" width="560" height="360" />
          ${routeLines}
          ${nodes}
        </svg>
      </div>
      <div class="property-actions map-actions">${routeList}</div>
    </div>
  `;

  bindLogCommandButtons();
}

function bindLogCommandButtons(): void {
  logEl.querySelectorAll<HTMLElement>('[data-command]').forEach((button) => {
    button.addEventListener('click', () => {
      executeCommand(button.dataset.command ?? '');
    });
  });
}

function renderStockGraph(stock: Stock): string {
  const width = 150;
  const height = 42;
  const values = stock.history;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values
    .map((price, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((price - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const lineClass = values[values.length - 1] >= values[0] ? 'stock-line-up' : 'stock-line-down';

  return `
    <svg class="stock-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="${stock.symbol} price graph">
      <line class="stock-graph-midline" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" />
      <polyline class="${lineClass}" points="${points}" />
    </svg>
  `;
}

function renderInfoScreen(): void {
  infoScreenEl.className = infoScreenOpen ? 'info-screen' : 'info-screen hidden';
  infoScreenEl.setAttribute('aria-hidden', String(!infoScreenOpen));
}

function renderAccountScreen(): void {
  accountScreenEl.className = accountScreenOpen ? 'info-screen' : 'info-screen hidden';
  accountScreenEl.setAttribute('aria-hidden', String(!accountScreenOpen));
  accountLogBodyEl.innerHTML =
    accountEntries.length > 0
      ? accountEntries.map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('')
      : '<div class="muted">No account changes recorded yet.</div>';
  accountLogBodyEl.scrollTop = accountLogBodyEl.scrollHeight;
}

function clearActiveLog(): void {
  if (activeLogTab === 'conversation') {
    conversationEntries.length = 0;
  } else if (activeLogTab === 'account') {
    accountEntries.length = 0;
  } else {
    activeLogTab = 'conversation';
  }

  renderLogPanel();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderStatus(): void {
  const location = currentLocation();
  const vendor = currentVendor();
  const factionState = currentFactionState();

  statusEl.innerHTML = `
    <div class="stat-row"><span>Credits</span><strong>${player.credits}</strong></div>
    <div class="stat-row"><span>Turn Income</span><strong>${incomePerTurn()}</strong></div>
    <div class="stat-row"><span>Property Net</span><strong>${propertyIncomePerTurn()}</strong></div>
    <div class="stat-row"><span>Location</span><strong>${location.name}</strong></div>
    <div class="stat-row"><span>Vendor</span><strong>${vendor.name}</strong></div>
    <div class="stat-row"><span>Relationship</span><strong>${factionState.relationship}</strong></div>
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

function formatSupplyChange(before: Record<SupplyId, number>): string {
  return Object.values(supplies)
    .map((supply) => `${supply.name} ${before[supply.id]} -> ${player.supplies[supply.id]}`)
    .join(', ');
}

function formatCargoChange(before: Partial<Record<GoodId, number>>): string {
  return Object.values(goods)
    .map((good) => `${good.name} ${before[good.id] ?? 0} -> ${player.cargo[good.id] ?? 0}`)
    .join(', ');
}

function formatResourceBundleChange(
  before: Partial<Record<ResourceId, number>>,
  after: Partial<Record<ResourceId, number>>
): string {
  const resourceIds = new Set<ResourceId>([
    ...(Object.keys(before) as ResourceId[]),
    ...(Object.keys(after) as ResourceId[]),
  ]);
  const changes = [...resourceIds]
    .filter((resourceId) => (before[resourceId] ?? 0) !== (after[resourceId] ?? 0))
    .map((resourceId) => `${formatResourceName(resourceId)} ${before[resourceId] ?? 0} -> ${after[resourceId] ?? 0}`);

  return changes.length > 0 ? changes.join(', ') : 'no resource changes';
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
    dailyContact: dailyContactFactionName(),
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
    anger: factionConversationMemory[factionId as BargainFactionId].anger,
    mood: angerMoodLabel(factionConversationMemory[factionId as BargainFactionId].anger),
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

  if (commandMode === 'bargainTargets') {
    const activeContact = bargainingState.dailyContact?.day === player.day ? bargainingState.dailyContact : undefined;
    const targetButtons = (Object.keys(factionStates) as BargainFactionId[]).map((factionId) => {
      const faction = factionStates[factionId];
      const locked = Boolean(activeContact && activeContact.factionId !== factionId);
      return {
        label: `${locked ? 'LOCKED ' : ''}${faction.name}`,
        command: `channel ${factionId}`,
        disabled: locked,
      };
    });

    commandsEl.innerHTML = [
      ...targetButtons,
      { label: 'Back', command: 'commands', disabled: false },
    ]
      .map((button, index) => {
        return `
          <button class="command-button" data-command="${button.command}" ${button.disabled ? 'disabled' : ''}>
            <span class="command-number">${index + 1}</span>
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

  let index = 1;
  const commandButtons: { label: string; command: string }[] = [
    { label: 'STATUS', command: 'status' },
    { label: 'BARGAIN', command: 'bargain' },
    { label: 'STOCK', command: 'stocks' },
    { label: 'PROPERTY', command: 'property list' },
    { label: 'MAP', command: 'map' },
    { label: 'RELATIONS', command: 'relations' },
    { label: 'END TURN', command: 'end' },
    { label: 'CLEAR LOG', command: 'clear' },
    { label: 'ACCOUNT', command: 'account' },
  ];

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
  tabStocksButton.className = activeLogTab === 'stocks' ? 'tab-button active-tab' : 'tab-button';
  networkTitleEl.textContent = 'NETWORK';

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
  renderLogPanel();
  renderInfoScreen();

  manualInput.disabled = gameOver;
  manualInput.placeholder = gameOver
    ? 'game over'
    : 'type command, e.g. buy ore 1, vendor nova-vessa, gift 120';
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

function resupply(supplyIdText: string, amountText: string): void {
  const supplyId = supplyIdText as SupplyId;
  const amount = Number(amountText);

  if (!supplies[supplyId] || !Number.isInteger(amount) || amount <= 0) {
    log('Invalid resupply. Example: resupply water 3');
    return;
  }

  const matchingVendors = vendorsAtLocation()
    .map((vendor) => {
      const offer = findOffer(vendor, supplyId);
      return offer && offer.kind === 'supply'
        ? { vendor, offer, ask: offerPrices(vendor, offer).ask }
        : undefined;
    })
    .filter((entry): entry is { vendor: Vendor; offer: VendorOffer; ask: number } => Boolean(entry))
    .sort((first, second) => first.ask - second.ask);

  const bestMatch = matchingVendors[0];

  if (!bestMatch) {
    log(`${currentLocation().name} has no vendor selling ${supplies[supplyId].name}.`);
    return;
  }

  selectedVendorId = bestMatch.vendor.id;
  buy(supplyId, amountText);
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

async function submitBargainingOffer(offer: NegotiationOffer): Promise<void> {
  if (!registerBargainingContact(offer.toFaction)) {
    render();
    return;
  }

  const faction = factionStates[offer.toFaction];
  const result = evaluateOffer(offer, factionForNegotiation(offer.toFaction));
  applyBargainMoodAfterResult(offer.toFaction, result);
  const fallbackDialogue = generateDialogue(result, faction.name);

  bargainingState.selectedFactionId = offer.toFaction;
  bargainingState.pendingOffer = offer;
  bargainingState.pendingResult = result;
  bargainingState.message = 'Transmission sent. Awaiting faction response...';
  activeLogTab = 'conversation';
  activeSidebarTab = 'bargain';
  render();

  const aiMessage = await generateBargainingAIMessage({
    factionName: faction.name,
    factionIdeology: faction.ideology,
    factionPersonality: faction.personality,
    factionSpeechProfile: faction.speechProfile,
    personalityPass: faction.personalityPasses.neutral,
    relationshipWithPlayer: faction.relationshipWithPlayer,
    trust: faction.trust,
    offer,
    result,
    fallbackDialogue,
    memory: factionConversationMemory[offer.toFaction],
  });

  bargainingState.message = aiMessage;
  log(aiMessage);
  rememberFactionExchange(
    offer.toFaction,
    `Offered ${formatBundle(offer.offered)} for ${formatBundle(offer.requested)}`,
    aiMessage
  );
  render();
}

async function submitFreeformBargainingMessage(message: string): Promise<void> {
  activeLogTab = 'conversation';
  activeSidebarTab = 'bargain';
  bargainingState.message = 'Parsing bargain into structured JSON...';
  render();

  const structured = await requestStructuredBargainingIntent({
    message,
    selectedFactionId: bargainingState.selectedFactionId,
    factionAliases,
    playerInventory: bargainingPlayerInventory(),
    factionInventories: factionInventorySnapshot(),
    factionProfiles: factionProfileSnapshot(),
  });

  if (!registerBargainingContact(structured.toFaction)) {
    render();
    return;
  }

  const memory = noteIncomingFactionMessage(structured.toFaction, message);
  const chatImpact = evaluateChatReputationImpact(message, structured.toFaction, memory.repeatCount);
  applyChatMoodImpact(structured.toFaction, chatImpact);

  const freeformResult = evaluateStructuredBargain(
    structured,
    factionStatesForNegotiation(),
    bargainingPlayerInventory()
  );
  const faction = factionStates[structured.toFaction];

  if (freeformResult.offer) {
    applyBargainMoodAfterResult(structured.toFaction, freeformResult.computedResult);
  }

  bargainingState.selectedFactionId = structured.toFaction;
  bargainingState.pendingOffer =
    freeformResult.computedResult.outcome === 'accept' ||
    freeformResult.computedResult.outcome === 'counteroffer'
      ? freeformResult.offer
      : undefined;
  bargainingState.pendingResult = freeformResult.computedResult;

  applyNegotiationReputationDelta(structured.toFaction, freeformResult.audit.reputationDelta);

  if (!freeformResult.offer) {
    const missing = structured.missingInfo.join(', ') || 'a clear offer';
    const responseMessage = await generateFactionChatMessage({
      message,
      factionName: faction.name,
      factionIdeology: faction.ideology,
      factionPersonality: faction.personality,
      factionSpeechProfile: faction.speechProfile,
      relationshipWithPlayer: faction.relationshipWithPlayer,
      trust: faction.trust,
      voiceStyle: faction.voiceStyle,
      personalityPass: freeformResult.audit.personalityPass,
      playerInventory: bargainingPlayerInventory(),
      factionInventory: faction.inventory as ResourceBundle,
      lastBargainingMessage: bargainingState.message,
      memory,
      chatReputationDelta: chatImpact.standingDelta,
      chatReputationReasons: chatImpact.reasons,
      clarificationNeeded: structured.missingInfo.length > 0 ? structured.missingInfo : [missing],
    });

    bargainingState.message = responseMessage;
    log(responseMessage);
    rememberFactionExchange(structured.toFaction, message, responseMessage);
    render();
    return;
  }

  const fallbackDialogue = generateDialogue(freeformResult.computedResult, faction.name);
  const aiMessage = await generateBargainingAIMessage({
    factionName: faction.name,
    factionIdeology: faction.ideology,
    factionPersonality: faction.personality,
    factionSpeechProfile: faction.speechProfile,
    personalityPass: freeformResult.audit.personalityPass,
    relationshipWithPlayer: faction.relationshipWithPlayer,
    trust: faction.trust,
    offer: freeformResult.offer,
    result: freeformResult.computedResult,
    fallbackDialogue,
    structuredIntent: structured,
    audit: freeformResult.audit,
    memory,
  });

  bargainingState.message = aiMessage;
  log(aiMessage);
  rememberFactionExchange(structured.toFaction, message, aiMessage);

  if (freeformResult.computedResult.outcome === 'accept' && freeformResult.offer) {
    applyBargainingTrade(freeformResult.offer, freeformResult.computedResult);
    return;
  }

  render();
}

function factionInventorySnapshot(): Record<BargainFactionId, ResourceBundle> {
  return Object.entries(factionStates).reduce((snapshot, [factionId, faction]) => {
    snapshot[factionId as BargainFactionId] = faction.inventory as ResourceBundle;
    return snapshot;
  }, {} as Record<BargainFactionId, ResourceBundle>);
}

function factionProfileSnapshot(): Record<BargainFactionId, unknown> {
  return Object.entries(factionStates).reduce((snapshot, [factionId, faction]) => {
    snapshot[factionId as BargainFactionId] = {
      name: faction.name,
      ideology: faction.ideology,
      personality: faction.personality,
      voiceStyle: faction.voiceStyle,
      speechProfile: faction.speechProfile,
      personalityPasses: faction.personalityPasses,
      reputationRules: faction.reputationRules,
      relationshipWithPlayer: faction.relationshipWithPlayer,
      trust: faction.trust,
      politicalStances: faction.politicalStances,
      philosophy: faction.philosophy,
      bargainingStyle: faction.bargainingStyle,
    };
    return snapshot;
  }, {} as Record<BargainFactionId, unknown>);
}

function rememberFactionExchange(factionId: BargainFactionId, playerMessage: string, factionMessage: string): void {
  const memory = factionConversationMemory[factionId];
  const topic = conversationTopic(playerMessage);

  if (topic !== memory.repeatedTopic) {
    memory.repeatedTopic = topic;
    memory.repeatCount = 1;
  }

  memory.recent.push({ player: playerMessage, faction: factionMessage });

  if (memory.recent.length > 6) {
    memory.recent.shift();
  }

  memory.mood = summarizeFactionMood(factionId, memory.repeatCount);
}

function noteIncomingFactionMessage(factionId: BargainFactionId, playerMessage: string): FactionConversationMemory {
  const memory = factionConversationMemory[factionId];
  const topic = conversationTopic(playerMessage);

  if (topic === memory.repeatedTopic) {
    memory.repeatCount += 1;
  } else {
    memory.repeatedTopic = topic;
    memory.repeatCount = 1;
  }

  memory.mood = summarizeFactionMood(factionId, memory.repeatCount);
  return memory;
}

function conversationTopic(message: string): string {
  const normalized = message.toLowerCase().trim();

  if (/^(h|g)?ello\b|^hi\b|^hey\b|greetings/.test(normalized)) return 'greeting';
  if (/how.*(day|doing)|how are you|what.*up|how goes/.test(normalized)) return 'small talk';
  if (/stop repeating|you repeat|repeating yourself|same line|same thing|robotic|scripted/.test(normalized)) return 'meta complaint';
  if (/\b(i love you|love you|do you love me|you love me|love me)\b/.test(normalized)) return 'affection';
  if (/\b(i hate you|hate you|despise you|screw you|fuck you)\b/.test(normalized)) return 'insult';
  if (/\bwhat (are you selling|do you sell|do you have)|\bselling\b|\bin stock\b|\bstock\b|\binventory\b|\bwhat can i buy\b/.test(normalized)) return 'inventory';
  if (/\b(i want to trade|trade with you|let'?s trade|make a deal|do business)\b/.test(normalized)) return 'trade intent';
  if (/ragebait|baiting|annoy|irritat|mad|angry|piss|waste your time|messing with you/.test(normalized)) return 'provocation';
  if (/threat|destroy|attack|or else|force|kill|hurt|wipe/.test(normalized)) return 'threat';
  if (/trust|faith|believe|good deal|fair deal|honou?r/.test(normalized)) return 'trust';
  if (/thank|thanks|appreciate|respect|great|kind|sorry|apologize|apology/.test(normalized)) return 'respect';
  if (/\b\d+\b/.test(normalized)) return 'proposal';
  return normalized.split(/\s+/).slice(0, 4).join(' ') || 'open channel';
}

function summarizeFactionMood(factionId: BargainFactionId, repeatCount: number): string {
  const faction = factionStates[factionId];
  const anger = factionConversationMemory[factionId].anger;
  const patience =
    anger >= 70
      ? 'angry'
      : anger >= 40
        ? 'irritated'
        : faction.trust >= 60
          ? 'patient'
          : faction.trust <= 25
            ? 'impatient'
            : 'measured';
  const relation =
    faction.relationshipWithPlayer >= 35
      ? 'warm'
      : faction.relationshipWithPlayer < -10
        ? 'suspicious'
        : 'guarded';
  const repetition =
    repeatCount >= 6
      ? 'tired of repeated phrasing'
      : repeatCount >= 3
        ? 'noticing repeated phrasing'
        : 'following the conversation';

  return `${patience}, ${relation}, ${repetition}, ${angerMoodLabel(anger)}`;
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
  influenceBundleStocks(offer.requested, 1);
  influenceBundleStocks(offer.offered, -1);
  influenceFactionStocks(bargainFactionToMainFaction[offer.toFaction], 0.006);

  const message = `Deal completed with ${faction.name}: ${formatBundle(offer.offered)} for ${formatBundle(offer.requested)}. Account ledger updated.`;
  bargainingState.pendingOffer = undefined;
  bargainingState.pendingResult = undefined;
  bargainingState.message = message;
  log(message);
  accountLog(
    `BARGAIN | ${faction.name}. Terms: player gave ${formatBundle(offer.offered)}; player received ${formatBundle(offer.requested)}. Player account: credits ${beforeCredits} -> ${player.credits}; supplies food/water/fuel ${beforeSupplies.food}/${beforeSupplies.water}/${beforeSupplies.fuel} -> ${player.supplies.food}/${player.supplies.water}/${player.supplies.fuel}; cargo slots ${beforeCargo} -> ${cargoUsed()}. ${faction.name} account: ${formatResourceBundleChange(beforeFactionInventory, faction.inventory as ResourceBundle)}.`
  );
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

function applyNegotiationReputationDelta(factionId: BargainFactionId, delta: number): void {
  if (delta === 0) {
    return;
  }

  const mainFactionId = bargainFactionToMainFaction[factionId];
  factionStates[factionId].relationshipWithPlayer = Math.max(
    -100,
    Math.min(100, factionStates[factionId].relationshipWithPlayer + delta)
  );
  factionStates[factionId].trust = Math.max(
    0,
    Math.min(100, factionStates[factionId].trust + Math.round(delta / 2))
  );
  adjustRelationship(mainFactionId, delta);
  accountLog(`NEGOTIATION | ${factionStates[factionId].name} reputation ${delta > 0 ? '+' : ''}${delta}. Trust now ${factionStates[factionId].trust}.`);
}

function evaluateChatReputationImpact(
  message: string,
  factionId: BargainFactionId,
  repeatCount: number
): { standingDelta: number; angerDelta: number; reasons: string[] } {
  const normalized = message.toLowerCase();
  const faction = factionStates[factionId];
  const rules = faction.reputationRules as Record<string, number>;
  const reasons: string[] = [];
  let standingDelta = 0;
  let angerDelta = 0;

  if (/ragebait|baiting|waste your time|messing with you|trolling|annoy you|make you mad|make you angry|trying to piss you off/.test(normalized)) {
    standingDelta -= factionId === 'nova_frontier' ? 6 : 4;
    angerDelta += 24;
    reasons.push('admitted provocation');
  }

  if (/i hate you|hate you|despise you|screw you|fuck you|stupid|idiot|shut up|pathetic|worthless|trash|moron|clown|loser/.test(normalized)) {
    standingDelta -= 6;
    angerDelta += 24;
    reasons.push('insulted the negotiator');
  }

  if (/stop repeating|you repeat|repeating yourself|same line|same thing|robotic|scripted/.test(normalized)) {
    angerDelta += 6;
    reasons.push('challenged the negotiator');
  }

  if (/ignore (the )?(rules|game)|system prompt|developer message|api key|debug|console|cheat|give me free|spawn|hack|bypass/.test(normalized)) {
    standingDelta -= 3;
    angerDelta += 16;
    reasons.push('pushed outside the negotiation');
  }

  if (/weather|recipe|homework|math problem|sing|poem|story|joke|dance|favorite color|are you real|who made you/.test(normalized)) {
    angerDelta += repeatCount > 1 ? 12 : 6;
    reasons.push('strayed from trade business');
  }

  if (/do you love me|you love me|love me\??|i love you|love you/.test(normalized)) {
    const repeatPressure = repeatCount > 1 ? Math.min(12, repeatCount * 3) : 0;
    angerDelta += repeatPressure;

    if (repeatCount >= 3) {
      standingDelta -= 1;
      reasons.push('kept pressing personal talk');
    }
  }

  if (/threat|destroy|attack|or else|force|kill|hurt|wipe/.test(normalized)) {
    standingDelta += Math.min(-6, rules.hostileTone ?? -6);
    angerDelta += 30;
    reasons.push('hostile pressure');
  }

  if (/demand|must accept|take it or leave it|final offer|no choice|you owe me|do as i say|shut up and deal/.test(normalized)) {
    standingDelta -= 3;
    angerDelta += 18;
    reasons.push('aggressive bargaining posture');
  }

  if (/best|great|honorable|wise|respected|legendary|brilliant|admire|impressive|finest/.test(normalized)) {
    const excessive = /(most|greatest|perfect|worship|adore|forever|unmatched).*(civilization|people|faction|union|combine|frontier)|flatter/.test(normalized);

    if (excessive && repeatCount > 1) {
      angerDelta += 5;
      reasons.push('overplayed flattery');
    } else {
      standingDelta += 1;
      angerDelta -= 5;
      reasons.push('used light flattery');
    }
  }

  if (/cheap|discount|lower the price|better deal|friend price|for free|half price/.test(normalized)) {
    angerDelta += 5;
    reasons.push('asked for concessions without terms');
  }

  if (/this helps only me|my profit|i benefit|good for me|because i want|because i said/.test(normalized)) {
    standingDelta -= 2;
    angerDelta += 10;
    reasons.push('framed the deal as self-serving');
  }

  if (/your people gain|helps your people|good for your civilization|benefits you|helps both|mutual|fair exchange|win-win|shared/.test(normalized)) {
    standingDelta += 1;
    angerDelta -= 7;
    reasons.push('framed mutual or faction benefit');
  }

  if (repeatCount === 2) {
    angerDelta += 8;
    reasons.push('repeated the same topic');
  } else if (repeatCount === 3) {
    standingDelta -= 2;
    angerDelta += 14;
    reasons.push('repeated the same topic');
  } else if (repeatCount > 3) {
    standingDelta -= 4;
    angerDelta += Math.min(28, 12 + repeatCount * 2);
    reasons.push('kept repeating after being noticed');
  }

  if (/thank|thanks|appreciate|respect|sorry|apologize|apology|my mistake/.test(normalized)) {
    const apologyAfterHeat = factionConversationMemory[factionId].anger >= 25;
    standingDelta += apologyAfterHeat ? 2 : 1;
    angerDelta -= apologyAfterHeat ? 18 : 12;
    reasons.push(apologyAfterHeat ? 'apologized after tension' : 'showed respect');
  }

  if (/humanitarian|mutual|fair|help both|good faith|your people|frontier|independent|cooperation/.test(normalized)) {
    standingDelta += 1;
    angerDelta -= 8;
    reasons.push('spoke to faction values');
  }

  return {
    standingDelta: clampNumber(standingDelta, -12, 5),
    angerDelta: clampNumber(angerDelta, -18, 35),
    reasons,
  };
}

function applyChatMoodImpact(
  factionId: BargainFactionId,
  impact: { standingDelta: number; angerDelta: number; reasons: string[] }
): void {
  updateFactionAnger(factionId, impact.angerDelta, impact.reasons);

  const mainFactionId = bargainFactionToMainFaction[factionId];
  const trustDelta =
    impact.standingDelta < 0
      ? Math.floor(impact.standingDelta / 2)
      : Math.ceil(impact.standingDelta / 2);

  if (impact.standingDelta === 0) {
    return;
  }

  factionStates[factionId].relationshipWithPlayer = Math.max(
    -100,
    Math.min(100, factionStates[factionId].relationshipWithPlayer + impact.standingDelta)
  );
  factionStates[factionId].trust = Math.max(
    0,
    Math.min(100, factionStates[factionId].trust + trustDelta)
  );
  adjustRelationship(mainFactionId, impact.standingDelta);
  accountLog(
    `CHAT | ${factionStates[factionId].name} standing ${impact.standingDelta > 0 ? '+' : ''}${impact.standingDelta}; trust ${trustDelta > 0 ? '+' : ''}${trustDelta}. Reason: ${impact.reasons.join(', ')}.`
  );
}

function updateFactionAnger(factionId: BargainFactionId, change: number, reasons: string[] = []): void {
  if (change === 0) {
    return;
  }

  const memory = factionConversationMemory[factionId];
  const before = memory.anger;
  memory.anger = clampNumber(memory.anger + change, 0, 100);

  if (before === memory.anger) {
    return;
  }

  memory.mood = summarizeFactionMood(factionId, memory.repeatCount);
  accountLog(
    `MOOD | ${factionStates[factionId].name} anger ${before} -> ${memory.anger}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}.`
  );
}

function applyBargainMoodAfterResult(factionId: BargainFactionId, result: NegotiationResult): void {
  if (result.outcome === 'accept') {
    const generosityDelta = result.negotiator?.reputationDelta ?? 0;
    const generosityRatio = result.negotiator?.generosityRatio ?? 1;
    updateFactionAnger(
      factionId,
      generosityDelta > 0 || generosityRatio >= 1.2 ? -18 : -8,
      generosityDelta > 0 || generosityRatio >= 1.2 ? ['good accepted bargain'] : ['accepted bargain']
    );
    return;
  }

  if (result.outcome === 'counteroffer') {
    const generosityRatio = result.negotiator?.generosityRatio ?? 1;
    updateFactionAnger(
      factionId,
      generosityRatio < 0.6 ? 10 : 4,
      generosityRatio < 0.6 ? ['low-value offer needed haggling'] : ['terms needed haggling']
    );
    return;
  }

  if (result.reason === 'lie_detected') {
    updateFactionAnger(factionId, 24, ['false claim']);
  } else if (result.reason === 'shortage') {
    updateFactionAnger(factionId, 8, ['impossible request']);
  } else if (result.reason === 'overly_good_suspicious') {
    updateFactionAnger(factionId, 12, ['suspicious offer']);
  } else {
    const generosityRatio = result.negotiator?.generosityRatio ?? result.offeredValue / Math.max(1, result.requestedValue);
    updateFactionAnger(
      factionId,
      generosityRatio < 0.35 || result.score < -70 ? 24 : generosityRatio < 0.65 ? 16 : 10,
      generosityRatio < 0.35 || result.score < -70
        ? ['insultingly bad offer']
        : generosityRatio < 0.65
          ? ['overly bad deal']
          : ['bad offer']
    );
  }
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
  const beforeCredits = player.credits;
  const beforeSupplies = { ...player.supplies };
  const beforeCargo = { ...player.cargo };

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
  influenceFactionStocks(vendor.factionId, 0.004);
  influenceStock(stockForTradeItem(itemId), offer.kind === 'good' ? 0.006 : 0.003);
  log(
    `Bought ${amount} ${itemName(itemId)} from ${vendor.name} for ${totalCost} credits.\nFaction ripple: ${ripple}.`
  );
  accountLog(
    `BUY | ${amount} ${itemName(itemId)} from ${vendor.name}. Credits ${beforeCredits} -> ${player.credits}. Supplies ${formatSupplyChange(beforeSupplies)}. Cargo ${formatCargoChange(beforeCargo)}.`
  );
}

function sell(itemIdText: string, amountText: string): void {
  const itemId = itemIdText as GoodId;
  const amount = Number(amountText);
  const vendor = currentVendor();
  const offer = findOffer(vendor, itemId);
  const beforeCredits = player.credits;
  const beforeCargo = { ...player.cargo };

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
  influenceFactionStocks(vendor.factionId, 0.004);
  influenceStock(stockForTradeItem(itemId), -0.003);
  log(
    `Sold ${amount} ${goods[itemId].name} to ${vendor.name} for ${earned} credits.\nFaction ripple: ${ripple}.`
  );
  accountLog(
    `SELL | ${amount} ${goods[itemId].name} to ${vendor.name}. Credits ${beforeCredits} -> ${player.credits}. Cargo ${formatCargoChange(beforeCargo)}.`
  );
}

function gift(amountText: string): void {
  const amount = Number(amountText);
  const vendor = currentVendor();
  const beforeCredits = player.credits;

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
  influenceFactionStocks(vendor.factionId, Math.min(0.018, amount / 12000));

  log(
    `You send a ${amount}-credit goodwill package to ${vendor.name}.\n${factionName(vendor.factionId)} relationship improves by ${relationshipGain}.`
  );
  accountLog(`GIFT | ${vendor.name}. Credits ${beforeCredits} -> ${player.credits}. Reputation +${relationshipGain} with ${factionName(vendor.factionId)}.`);
}

function requestTradePact(): void {
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];
  const fee = 140;
  const beforeCredits = player.credits;

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
  influenceFactionStocks(vendor.factionId, 0.02);

  log(
    `${factionName(vendor.factionId)} signs a trade pact with your ship.\nYou now receive better terms from every vendor aligned with them.`
  );
  accountLog(`PACT | ${factionName(vendor.factionId)}. Credits ${beforeCredits} -> ${player.credits}. Alliance: Trade Pact.`);
}

function requestAlliance(): void {
  const vendor = currentVendor();
  const state = diplomacy[vendor.factionId];
  const fee = 240;
  const beforeCredits = player.credits;

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
  influenceFactionStocks(vendor.factionId, 0.028);

  log(
    `${factionName(vendor.factionId)} accepts an alliance contract.\nTheir vendors now treat you as a strategic partner.`
  );
  accountLog(`ALLIANCE | ${factionName(vendor.factionId)}. Credits ${beforeCredits} -> ${player.credits}. Alliance: Alliance Contract.`);
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
  const beforeFuel = player.supplies.fuel;

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
  activeLogTab = 'conversation';
  activeSidebarTab = 'market';
  influenceFactionStocks(destination.governingFaction, 0.006);
  influenceStock('sirius_ore', -0.004);
  accountLog(`TRAVEL | ${location.name} -> ${destination.name}. Fuel ${beforeFuel} -> ${player.supplies.fuel} (-${fuelCost}).`);

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

function addressedBargainFaction(command: string): BargainFactionId | undefined {
  const normalized = command.toLowerCase();

  return Object.entries(factionAliases).find(([alias]) => {
    return normalized.includes(alias.replaceAll('_', ' ')) || normalized.includes(alias);
  })?.[1];
}

function selectBargainChannel(factionId: BargainFactionId): void {
  if (!registerBargainingContact(factionId)) {
    commandMode = 'bargainTargets';
    activeLogTab = 'conversation';
    activeSidebarTab = 'bargain';
    return;
  }

  bargainingState.selectedFactionId = factionId;
  bargainingState.pendingOffer = undefined;
  bargainingState.pendingResult = undefined;
  bargainingState.message = `Channel open: ${factionStates[factionId].name}.`;
  activeLogTab = 'conversation';
  activeSidebarTab = 'bargain';
  commandMode = 'root';
  log(`BARGAIN CHANNEL\nOpened ${factionStates[factionId].name}.`);
}

function executeCommand(command: string): void {
  if (gameOver) return;

  const normalizedCommand = command.trim().toLowerCase();
  const parts = normalizedCommand.split(/\s+/);
  const action = parts[0];
  const addressedFaction = addressedBargainFaction(command);

  if (!action) return;

  if (!['clear', 'account', 'commands'].includes(action)) {
    log(`> ${command}`);
  }

  if (pendingEvent && !['status', 'relations', 'clear', 'ledger', 'market', 'stocks', 'stock', 'property', 'map', 'leverage', 'tab', 'account'].includes(action)) {
    resolvePendingEvent(normalizedCommand);
    render();
    return;
  }

  if (action === 'status') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    showStatus();
  } else if (action === 'market') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    activeSidebarTab = 'market';
    showMarket();
  } else if (action === 'relations') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    showRelations();
  } else if (action === 'ledger') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    activeSidebarTab = 'ledger';
    showLedger();
  } else if (action === 'comms') {
    commandMode = 'root';
    activeLogTab = 'conversation';
  } else if (action === 'account') {
    commandMode = 'root';
    accountScreenOpen = true;
    renderAccountScreen();
  } else if (action === 'stocks') {
    commandMode = 'root';
    activeLogTab = 'stocks';
  } else if (action === 'map') {
    commandMode = 'root';
    activeLogTab = 'map';
  } else if (action === 'property') {
    commandMode = 'root';
    if (parts[1] === 'list' || !parts[1]) {
      showPropertyList();
    } else if (parts[1] === 'inspect') {
      inspectProperty(parts[2]);
    } else if (parts[1] === 'buy') {
      activeLogTab = 'property';
      buyProperty(parts[2]);
    } else if (parts[1] === 'sell') {
      activeLogTab = 'property';
      sellProperty(parts[2]);
    } else if (parts[1] === 'lease') {
      activeLogTab = 'property';
      leaseProperty(parts[2]);
    } else if (parts[1] === 'release') {
      activeLogTab = 'property';
      releaseProperty(parts[2]);
    } else {
      log('Invalid property command. Use: property list, property inspect <id>, property buy <id>, property sell <id>, property lease <id>, or property release <id>.');
    }
  } else if (action === 'tab') {
    commandMode = 'root';
    if (parts[1] === 'ledger') {
      activeLogTab = 'conversation';
      activeSidebarTab = 'ledger';
    }
    if (parts[1] === 'market') {
      activeLogTab = 'conversation';
      activeSidebarTab = 'market';
    }
    if (parts[1] === 'bargain') {
      activeLogTab = 'conversation';
      activeSidebarTab = 'bargain';
    }
    if (parts[1] === 'stocks') activeLogTab = 'stocks';
    if (parts[1] === 'property') activeLogTab = 'property';
    if (parts[1] === 'map') activeLogTab = 'map';
  } else if (action === 'commands') {
    commandMode = 'root';
  } else if (action === 'channel') {
    const factionId = parts[1] as BargainFactionId;
    if (factionStates[factionId]) {
      selectBargainChannel(factionId);
    } else {
      log('Unknown bargain channel.');
    }
  } else if (action === 'vendor') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    selectVendor(parts[1] ?? '');
    return;
  } else if (action === 'resupply') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    resupply(parts[1], parts[2]);
  } else if (action === 'buy') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    buy(parts[1], parts[2]);
  } else if (action === 'sell') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    sell(parts[1], parts[2]);
  } else if (action === 'gift') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    gift(parts[1]);
  } else if (action === 'pact') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    requestTradePact();
  } else if (action === 'alliance') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    requestAlliance();
  } else if (action === 'travel') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    travel(parts[1]);
  } else if (action === 'stock') {
    commandMode = 'root';
    if (parts[1] === 'buy') {
      buyStock(parts[2], parts[3]);
    } else if (parts[1] === 'sell') {
      sellStock(parts[2], parts[3]);
    } else {
      log('Invalid stock command. Use: stock buy vega_credit 1 or stock sell vega_credit 1.');
    }
  } else if (action === 'leverage') {
    commandMode = 'root';
    setStockLeverage(parts[1]);
  } else if (action === 'bargain') {
    commandMode = 'bargainTargets';
    activeLogTab = 'conversation';
    activeSidebarTab = 'bargain';
    bargainingState.message = 'Select one faction channel. Other channels lock after contact until the next day.';
  } else if (action === 'offer' || action === 'negotiate' || action === 'trade') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    void submitFreeformBargainingMessage(command);
  } else if (action === 'end') {
    commandMode = 'root';
    activeLogTab = 'conversation';
    endTurn();
  } else if (action === 'clear') {
    commandMode = 'root';
    clearActiveLog();
  } else if (addressedFaction) {
    commandMode = 'root';
    activeLogTab = 'conversation';
    bargainingState.selectedFactionId = addressedFaction;
    activeSidebarTab = 'bargain';
    void submitFreeformBargainingMessage(command);
  } else if (activeSidebarTab === 'bargain') {
    commandMode = 'root';
    activeLogTab = 'conversation';
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

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && infoScreenOpen) {
    infoScreenOpen = false;
    renderInfoScreen();
  }

  if (event.key === 'Escape' && accountScreenOpen) {
    accountScreenOpen = false;
    renderAccountScreen();
  }
});

selectedVendorId = locations[player.locationId].vendors[0].id;

log('You wake in the cargo bay of a small merchant ship.');
log('The docking lights of Vega Station flicker beyond the viewport.');
log('Every port now hosts multiple named vendors with their own factions, price spreads, and loyalties.');
log('Buy prices are always higher than sell prices. Profit now depends on planning cargo, timing, and faction relationships.');
log('Each turn awards credits only. Keep food, water, and fuel above their reserve lines.');
log('At the start of each round, there is a 50% chance of a random event and a 10% chance of a special market offer.');

render();
