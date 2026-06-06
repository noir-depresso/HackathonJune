import { factionIds, factions } from '../data/factions';
import { goods, supplies } from '../data/items';
import { stockIds } from '../data/stocks';
import type { FactionId, GameState, GoodId, Stock, StockId, Vendor } from '../types';
import type { FactionId as BargainingFactionId, NegotiationOffer } from '../game/negotiation';
import {
  cargoUsed,
  currentLocation,
  currentVendor,
  ensureSelectedVendor,
  factionName,
  incomePerTurn,
  vendorsAtLocation,
} from '../game/gameState';
import {
  allianceLabel,
  factionStance,
  formatRipple,
  itemName,
  offerPrices,
  formatSignedPercent,
  relationshipTier,
  specialBadge,
  stanceLabel,
  stockDayChange,
  stockDayChangePercent,
  stockPortfolioValue,
  stockPositionValue,
  tradeRippleEntries,
} from '../game/stockMarket';
import { getBargainingPanelState } from '../game/bargainingSession';
import { bindBargainingControls, renderBargainingPanel } from './bargainingUI';

type CommandHandler = (command: string) => void;
type BargainingHandlers = {
  onSelectFaction: (factionId: BargainingFactionId) => void;
  onSubmitOffer: (offer: NegotiationOffer) => void;
  onConfirmOffer: () => void;
  onAcceptCounteroffer: () => void;
  onCancelOffer: () => void;
  onSendMessage: (message: string) => void;
};

export class ExchangeUI {
  private readonly app: HTMLDivElement;
  private readonly onCommand: CommandHandler;
  private readonly bargainingHandlers: BargainingHandlers;
  private logEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private inventoryEl!: HTMLDivElement;
  private networkPanelEl!: HTMLDivElement;
  private diplomacyEl!: HTMLDivElement;
  private commandsEl!: HTMLDivElement;
  private stockModalEl!: HTMLDivElement;
  private gameOverModalEl!: HTMLDivElement;
  private headerLocationEl!: HTMLDivElement;
  private headerDayEl!: HTMLDivElement;
  private manualInput!: HTMLInputElement;
  private tabMarketButton!: HTMLButtonElement;
  private tabLedgerButton!: HTMLButtonElement;
  private tabBargainButton!: HTMLButtonElement;
  private tabStocksButton!: HTMLButtonElement;

  constructor(app: HTMLDivElement, onCommand: CommandHandler, bargainingHandlers: BargainingHandlers) {
    this.app = app;
    this.onCommand = onCommand;
    this.bargainingHandlers = bargainingHandlers;
    this.mount();
  }

  render(state: GameState): void {
    ensureSelectedVendor(state);
    const location = currentLocation(state);

    this.headerLocationEl.textContent = location.name;
    this.headerDayEl.textContent = state.gameOver ? 'GAME OVER' : `DAY ${state.player.day}`;
    this.tabMarketButton.className = state.activeSidebarTab === 'market' ? 'tab-button active-tab' : 'tab-button';
    this.tabLedgerButton.className = state.activeSidebarTab === 'ledger' ? 'tab-button active-tab' : 'tab-button';
    this.tabBargainButton.className = state.activeSidebarTab === 'bargain' ? 'tab-button active-tab' : 'tab-button';
    this.tabStocksButton.className = state.stockPopupOpen ? 'tab-button active-tab' : 'tab-button';

    this.renderLog(state);
    this.renderStatus(state);
    this.renderInventory(state);
    this.renderNetwork(state);
    this.renderDiplomacy(state);
    this.renderCommands(state);
    this.renderStockPopup(state);
    this.renderGameOverScreen(state);

    this.manualInput.disabled = false;
    this.manualInput.placeholder = state.gameOver
      ? 'type restart, new run, or click Restart Run'
      : 'type command, e.g. buy ore 1, vendor nova-vessa, gift 120';
  }

  private mount(): void {
    this.app.innerHTML = `
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
            <input id="manual-input" autocomplete="off" />
          </form>
        </footer>
      </div>

      <section id="stock-modal" class="stock-modal hidden" aria-hidden="true"></section>
      <section id="game-over-modal" class="game-over-modal hidden" aria-hidden="true"></section>
    `;

    this.logEl = this.query('#log');
    this.statusEl = this.query('#status');
    this.inventoryEl = this.query('#inventory');
    this.networkPanelEl = this.query('#network-panel');
    this.diplomacyEl = this.query('#diplomacy');
    this.commandsEl = this.query('#commands');
    this.stockModalEl = this.query('#stock-modal');
    this.gameOverModalEl = this.query('#game-over-modal');
    this.headerLocationEl = this.query('#header-location');
    this.headerDayEl = this.query('#header-day');
    this.manualInput = this.query('#manual-input');
    this.tabMarketButton = this.query('#tab-market');
    this.tabLedgerButton = this.query('#tab-ledger');
    this.tabBargainButton = this.query('#tab-bargain');
    this.tabStocksButton = this.query('#tab-stocks');

    const manualForm = this.query<HTMLFormElement>('#manual-form');
    manualForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const command = this.manualInput.value;
      this.manualInput.value = '';
      this.onCommand(command);
    });

    this.tabMarketButton.addEventListener('click', () => {
      this.onCommand('tab market');
    });

    this.tabLedgerButton.addEventListener('click', () => {
      this.onCommand('tab ledger');
    });

    this.tabBargainButton.addEventListener('click', () => {
      this.onCommand('tab bargain');
    });

    this.tabStocksButton.addEventListener('click', () => {
      this.onCommand('stocks');
    });
  }

  private query<T extends Element>(selector: string): T {
    const element = this.app.querySelector<T>(selector);

    if (!element) {
      throw new Error(`UI element not found: ${selector}`);
    }

    return element;
  }

  private renderLog(state: GameState): void {
    this.logEl.innerHTML = state.log.map((entry) => `<div class="log-entry">${entry}</div>`).join('');
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private renderStatus(state: GameState): void {
    const location = currentLocation(state);
    const vendor = currentVendor(state);
    const factionState = state.diplomacy[vendor.factionId];

    this.statusEl.innerHTML = `
      <div class="stat-row"><span>Credits</span><strong>${state.player.credits}</strong></div>
      <div class="stat-row"><span>Turn Income</span><strong>${incomePerTurn(state)}</strong></div>
      <div class="stat-row"><span>Location</span><strong>${location.name}</strong></div>
      <div class="stat-row"><span>Vendor</span><strong>${vendor.name}</strong></div>
      <div class="stat-row"><span>Standing</span><strong>${factionState.relationship}</strong></div>
      <div class="stat-row"><span>Cargo</span><strong>${cargoUsed(state)} / ${state.player.cargoCapacity}</strong></div>
    `;
  }

  private renderInventory(state: GameState): void {
    const supplyRows = Object.values(supplies)
      .map((supply) => {
        const amount = state.player.supplies[supply.id];
        const critical = amount < supply.warning ? ' danger' : '';
        return `<div class="stat-row${critical}"><span>${supply.name}</span><strong>${amount} / min ${supply.warning}</strong></div>`;
      })
      .join('');

    const cargoRows = Object.entries(state.player.cargo)
      .map(([goodId, amount]) => {
        return `<div class="stat-row"><span>${goods[goodId as GoodId].name}</span><strong>${amount}</strong></div>`;
      })
      .join('');

    this.inventoryEl.innerHTML = `
      <div class="box-subtitle">ESSENTIAL SUPPLIES</div>
      ${supplyRows}
      <div class="box-subtitle inventory-separator">TRADE CARGO</div>
      ${cargoRows || `<div class="muted">Empty cargo hold</div>`}
    `;
  }

  private renderNetwork(state: GameState): void {
    if (state.activeSidebarTab === 'market') {
      this.renderMarketTab(state);
      return;
    }

    if (state.activeSidebarTab === 'bargain') {
      this.renderBargainingTab(state);
      return;
    }

    this.renderLedgerTab(state);
  }

  private renderMarketTab(state: GameState): void {
    const activeVendor = currentVendor(state);
    const vendorCards = vendorsAtLocation(state)
      .map((vendor) => this.vendorCard(state, vendor, vendor.id === activeVendor.id))
      .join('');
    const ripple = formatRipple(tradeRippleEntries(activeVendor.factionId, 2));
    const specialText =
      state.activeSpecial?.vendorId === activeVendor.id
        ? `<div class="vendor-special-note">${state.activeSpecial.description}</div>`
        : '';

    this.networkPanelEl.innerHTML = `
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

    this.networkPanelEl.querySelectorAll<HTMLDivElement>('.vendor-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.onCommand(`vendor ${card.dataset.vendorId ?? ''}`);
      });
    });
  }

  private vendorCard(state: GameState, vendor: Vendor, active: boolean): string {
    const activeClass = active ? ' active-vendor' : '';
    const stockLines = vendor.stock
      .map((offer) => {
        const prices = offerPrices(state, vendor, offer);
        const badge = specialBadge(state, vendor.id, offer.itemId);
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
      <div class="vendor-card${activeClass}" data-vendor-id="${vendor.id}">
        <div class="vendor-head">
          <strong>${vendor.name}</strong>
          <span>${factionName(vendor.factionId)}</span>
        </div>
        <div class="vendor-role">${vendor.role}</div>
        <div class="vendor-bio">${vendor.bio}</div>
        <div class="vendor-stock">${stockLines}</div>
      </div>
    `;
  }

  private renderLedgerTab(state: GameState): void {
    const factionCards = factionIds.map((factionId) => this.factionCard(state, factionId)).join('');

    this.networkPanelEl.innerHTML = `
      <div class="box-subtitle">UNIVERSE LEDGER</div>
      <div class="ledger-list">${factionCards}</div>
    `;
  }

  private renderBargainingTab(state: GameState): void {
    this.networkPanelEl.innerHTML = renderBargainingPanel(getBargainingPanelState(state));
    bindBargainingControls(this.networkPanelEl, this.bargainingHandlers);
  }

  private renderStockPopup(state: GameState): void {
    if (!state.stockPopupOpen) {
      this.stockModalEl.className = 'stock-modal hidden';
      this.stockModalEl.setAttribute('aria-hidden', 'true');
      this.stockModalEl.innerHTML = '';
      return;
    }

    const rows = stockIds.map((stockId) => this.stockCard(state, stockId)).join('');

    this.stockModalEl.className = 'stock-modal';
    this.stockModalEl.setAttribute('aria-hidden', 'false');
    this.stockModalEl.innerHTML = `
      <div class="stock-modal-backdrop" data-command="stock close"></div>
      <section class="stock-modal-panel" role="dialog" aria-modal="true" aria-label="Faction stock exchange">
        <header class="stock-modal-header">
          <div>
            <div class="box-subtitle">FACTION EXCHANGE</div>
            <h2>Stock Market</h2>
            <p>Faction-linked equities react to reputation, trade, route pressure, events, and bargaining outcomes.</p>
          </div>
          <button class="stock-modal-close" type="button" data-command="stock close">X</button>
        </header>
        <div class="stock-modal-summary">
          <div class="stat-row"><span>Credits</span><strong>${state.player.credits}</strong></div>
          <div class="stat-row"><span>Portfolio</span><strong>${stockPortfolioValue(state)}</strong></div>
          <div class="stat-row"><span>Leverage</span><strong>${state.stockMarket.leverage}x</strong></div>
        </div>
        <div class="leverage-row stock-modal-leverage">
          <button class="tab-button ${state.stockMarket.leverage === 1 ? 'active-tab' : ''}" data-command="leverage 1">1x</button>
          <button class="tab-button ${state.stockMarket.leverage === 2 ? 'active-tab' : ''}" data-command="leverage 2">2x</button>
          <button class="tab-button ${state.stockMarket.leverage === 3 ? 'active-tab' : ''}" data-command="leverage 3">3x</button>
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
        <div class="stock-board stock-modal-board">${rows}</div>
      </section>
    `;

    this.stockModalEl.querySelectorAll<HTMLButtonElement | HTMLDivElement>('[data-command]').forEach((element) => {
      element.addEventListener('click', () => {
        this.onCommand(element.dataset.command ?? '');
      });
    });
  }

  private renderGameOverScreen(state: GameState): void {
    if (!state.gameOver) {
      this.gameOverModalEl.className = 'game-over-modal hidden';
      this.gameOverModalEl.setAttribute('aria-hidden', 'true');
      this.gameOverModalEl.innerHTML = '';
      return;
    }

    const strongestFaction = factionIds
      .map((factionId) => ({ factionId, relationship: state.diplomacy[factionId].relationship }))
      .sort((left, right) => right.relationship - left.relationship)[0];
    const weakestFaction = factionIds
      .map((factionId) => ({ factionId, relationship: state.diplomacy[factionId].relationship }))
      .sort((left, right) => left.relationship - right.relationship)[0];
    const cargoSummary =
      Object.entries(state.player.cargo)
        .map(([goodId, amount]) => `${goods[goodId as GoodId].name} ${amount}`)
        .join(', ') || 'Empty hold';

    this.gameOverModalEl.className = 'game-over-modal';
    this.gameOverModalEl.setAttribute('aria-hidden', 'false');
    this.gameOverModalEl.innerHTML = `
      <section class="game-over-panel" role="dialog" aria-modal="true" aria-label="Game over">
        <div class="game-over-kicker">SHIP LOG TERMINATED</div>
        <h1>Run Failed</h1>
        <p class="game-over-reason">${state.gameOverReason}</p>
        <div class="game-over-grid">
          <div class="game-over-card">
            <span>Days Survived</span>
            <strong>${state.player.day}</strong>
          </div>
          <div class="game-over-card">
            <span>Credits</span>
            <strong>${state.player.credits}</strong>
          </div>
          <div class="game-over-card">
            <span>Portfolio</span>
            <strong>${stockPortfolioValue(state)}</strong>
          </div>
          <div class="game-over-card">
            <span>Cargo</span>
            <strong>${cargoUsed(state)} / ${state.player.cargoCapacity}</strong>
          </div>
        </div>
        <div class="game-over-report">
          <div class="stat-row"><span>Final Location</span><strong>${currentLocation(state).name}</strong></div>
          <div class="stat-row"><span>Remaining Supplies</span><strong>F ${state.player.supplies.food} / W ${state.player.supplies.water} / Fuel ${state.player.supplies.fuel}</strong></div>
          <div class="stat-row"><span>Best Contact</span><strong>${factions[strongestFaction.factionId].name} ${strongestFaction.relationship}</strong></div>
          <div class="stat-row"><span>Worst Contact</span><strong>${factions[weakestFaction.factionId].name} ${weakestFaction.relationship}</strong></div>
          <div class="ledger-copy inventory-separator">Cargo manifest: ${cargoSummary}</div>
        </div>
        <p class="game-over-copy">
          The ship goes quiet, but the ledger keeps its lesson: profit only matters if the hold still has water, fuel, and food.
        </p>
        <div class="game-over-actions">
          <button class="command-button restart-button" type="button" data-command="restart">Restart Run</button>
        </div>
      </section>
    `;

    this.gameOverModalEl.querySelector<HTMLButtonElement>('[data-command]')?.addEventListener('click', (event) => {
      this.onCommand((event.currentTarget as HTMLButtonElement).dataset.command ?? '');
    });
  }

  private stockCard(state: GameState, stockId: StockId): string {
    const stock = state.stockMarket.stocks[stockId];
    const position = state.stockMarket.positions[stockId];
    const change = stockDayChange(state, stockId);
    const changePercent = stockDayChangePercent(state, stockId);
    const changeClass = change >= 0 ? 'stock-up' : 'stock-down';
    const buyOneCost = Math.ceil(stock.price / state.stockMarket.leverage);
    const buyFiveCost = Math.ceil((stock.price * 5) / state.stockMarket.leverage);

    return `
      <article class="stock-card">
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
          <strong>${position?.shares ?? 0}</strong>
          <span>avg ${position?.averagePrice ?? '-'}</span>
        </div>
        <div class="stock-cell">
          <span class="stock-cell-label">Value</span>
          <strong>${stockPositionValue(state, stockId)}</strong>
          <span>margin</span>
        </div>
        <div class="stock-sparkline">${this.stockGraph(stock)}</div>
        <div class="stock-actions">
          <button class="stock-trade-button buy-button" data-command="stock buy ${stockId} 1">B1 <span>${buyOneCost}</span></button>
          <button class="stock-trade-button buy-button" data-command="stock buy ${stockId} 5">B5 <span>${buyFiveCost}</span></button>
          <button class="stock-trade-button sell-button" data-command="stock sell ${stockId} 1">S1</button>
          <button class="stock-trade-button sell-button" data-command="stock sell ${stockId} 5">S5</button>
        </div>
      </article>
    `;
  }

  private stockGraph(stock: Stock): string {
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
    const lineClass = values.at(-1)! >= values[0] ? 'stock-line-up' : 'stock-line-down';

    return `
      <svg class="stock-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="${stock.symbol} price graph">
        <line class="stock-graph-midline" x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" />
        <polyline class="${lineClass}" points="${points}" />
      </svg>
    `;
  }

  private factionCard(state: GameState, factionId: FactionId): string {
    const factionState = state.diplomacy[factionId];
    const allies = this.relatedFactions(factionId, 'ally');
    const rivals = this.relatedFactions(factionId, 'rival');
    const hostiles = this.relatedFactions(factionId, 'hostile');

    return `
      <div class="ledger-card">
        <div class="ledger-title">${factions[factionId].name}</div>
        <div class="ledger-copy">${factions[factionId].identity}</div>
        <div class="stat-row"><span>Your Standing</span><strong>${factionState.relationship} (${relationshipTier(factionState.relationship)})</strong></div>
        <div class="stat-row"><span>Your Pact</span><strong>${allianceLabel(factionState.alliance)}</strong></div>
        <div class="ledger-copy">Allies: ${allies || 'None'}</div>
        <div class="ledger-copy">Rivals: ${rivals || 'None'}</div>
        <div class="ledger-copy">Hostile: ${hostiles || 'None'}</div>
      </div>
    `;
  }

  private relatedFactions(factionId: FactionId, stance: ReturnType<typeof factionStance>): string {
    return factionIds
      .filter((otherId) => otherId !== factionId && factionStance(factionId, otherId) === stance)
      .map((otherId) => factions[otherId].name)
      .join(', ');
  }

  private renderDiplomacy(state: GameState): void {
    const vendor = currentVendor(state);
    const factionState = state.diplomacy[vendor.factionId];
    const governor = factions[currentLocation(state).governingFaction];
    const relations = factionIds
      .filter((factionId) => factionId !== vendor.factionId)
      .map((factionId) => `${stanceLabel(factionStance(vendor.factionId, factionId))}: ${factionName(factionId)}`)
      .join('<br />');

    this.diplomacyEl.innerHTML = `
      <div class="stat-row"><span>Vendor Faction</span><strong>${factionName(vendor.factionId)}</strong></div>
      <div class="stat-row"><span>Relationship</span><strong>${factionState.relationship}</strong></div>
      <div class="stat-row"><span>Tier</span><strong>${relationshipTier(factionState.relationship)}</strong></div>
      <div class="stat-row"><span>Alliance</span><strong>${allianceLabel(factionState.alliance)}</strong></div>
      <div class="stat-row"><span>Port Authority</span><strong>${governor.name}</strong></div>
      <div class="ledger-copy inventory-separator">${relations}</div>
    `;
  }

  private renderCommands(state: GameState): void {
    if (state.gameOver) {
      this.commandsEl.innerHTML = `
        <button class="command-button event-command-button" data-command="restart">
          <span class="command-number">1</span>
          Restart Run
        </button>
        <div class="game-over-box">GAME OVER: ${state.gameOverReason}</div>
      `;
      this.commandsEl.querySelector<HTMLButtonElement>('[data-command="restart"]')?.addEventListener('click', () => {
        this.onCommand('restart');
      });
      return;
    }

    const buttons = state.pendingEvent ? this.eventCommands(state) : this.normalCommands();

    this.commandsEl.innerHTML = buttons
      .map((button, index) => {
        const eventClass = state.pendingEvent ? ' event-command-button' : '';
        return `
          <button class="command-button${eventClass}" data-command="${button.command}">
            <span class="command-number">${index + 1}</span>
            ${button.label}
          </button>
        `;
      })
      .join('');

    this.commandsEl.querySelectorAll<HTMLButtonElement>('.command-button').forEach((button) => {
      button.addEventListener('click', () => {
        this.onCommand(button.dataset.command ?? '');
      });
    });
  }

  private eventCommands(state: GameState): { label: string; command: string }[] {
    return [
      ...(state.pendingEvent?.options.map((option) => ({ label: option.label, command: option.command })) ?? []),
      { label: 'Status', command: 'status' },
      { label: 'Relations', command: 'relations' },
      { label: 'Clear Log', command: 'clear' },
    ];
  }

  private normalCommands(): { label: string; command: string }[] {
    return [{ label: 'Bargain', command: 'tab bargain' }];
  }
}
