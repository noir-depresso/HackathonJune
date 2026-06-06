import { factionIds, factionLinks, factions } from '../data/factions';
import { goods, supplies } from '../data/items';
import { stockIds } from '../data/stocks';
import type {
  AllianceStatus,
  FactionId,
  FactionStance,
  GameState,
  RippleEntry,
  StockId,
  StockLeverage,
  TradeItemId,
  Vendor,
  VendorOffer,
} from '../types';
import { adjustRelationship, appendLog, factionName } from './gameState';

export function itemName(itemId: TradeItemId): string {
  if (itemId in goods) {
    return goods[itemId as keyof typeof goods].name;
  }

  return supplies[itemId as keyof typeof supplies].name;
}

export function relationshipTier(relationship: number): string {
  if (relationship <= -50) return 'Hostile';
  if (relationship < -10) return 'Cold';
  if (relationship <= 10) return 'Mixed Opinion';
  if (relationship <= 50) return 'Friendly';
  if (relationship <= 80) return 'Trusted Partner';
  return 'Alliance Ready';
}

export function allianceLabel(status: AllianceStatus): string {
  if (status === 'trade_pact') return 'Trade Pact';
  if (status === 'alliance') return 'Alliance Contract';
  return 'No Pact';
}

export function stanceLabel(stance: FactionStance): string {
  if (stance === 'ally') return 'Ally';
  if (stance === 'friendly') return 'Friendly';
  if (stance === 'rival') return 'Rival';
  if (stance === 'hostile') return 'Hostile';
  return 'Neutral';
}

export function factionStance(first: FactionId, second: FactionId): FactionStance {
  if (first === second) return 'ally';

  return factionLinks[first][second] ?? factionLinks[second][first] ?? 'neutral';
}

export function tradeRippleEntries(primaryFaction: FactionId, directGain: number): RippleEntry[] {
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

export function formatRipple(entries: RippleEntry[]): string {
  return entries
    .map((entry) => `${entry.change > 0 ? '+' : ''}${entry.change} ${factionName(entry.factionId)}`)
    .join(', ');
}

export function applyTradeRipple(state: GameState, primaryFaction: FactionId, directGain: number): string {
  const entries = tradeRippleEntries(primaryFaction, directGain);

  for (const entry of entries) {
    adjustRelationship(state, entry.factionId, entry.change);
  }

  influenceFactionStocks(state, primaryFaction, directGain > 1 ? 0.004 : 0.002);

  return formatRipple(entries);
}

export function findOffer(vendor: Vendor, itemId: TradeItemId): VendorOffer | undefined {
  return vendor.stock.find((offer) => offer.itemId === itemId);
}

export function offerPrices(state: GameState, vendor: Vendor, offer: VendorOffer): { ask: number; bid?: number } {
  const factionState = state.diplomacy[vendor.factionId];
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

  if (state.activeSpecial?.vendorId === vendor.id && state.activeSpecial.itemId === offer.itemId) {
    if (state.activeSpecial.type === 'discount') {
      askFactor -= 0.22;
    } else if (state.activeSpecial.type === 'buyback' && offer.bid !== undefined) {
      bidFactor += 0.22;
    }
  }

  const ask = Math.max(1, Math.round(offer.ask * askFactor));
  const bid = offer.bid === undefined ? undefined : Math.max(1, Math.round(offer.bid * bidFactor));

  if (bid !== undefined && ask <= bid) {
    return { ask: bid + 1, bid };
  }

  return { ask, bid };
}

export function specialBadge(state: GameState, vendorId: string, itemId: TradeItemId): string {
  if (!state.activeSpecial || state.activeSpecial.vendorId !== vendorId || state.activeSpecial.itemId !== itemId) {
    return '';
  }

  return state.activeSpecial.type === 'discount' ? 'FLASH SALE' : 'HIGH DEMAND';
}

export function factionIdentity(factionId: FactionId): string {
  return factions[factionId].identity;
}

export function stockLabel(state: GameState, stockId: StockId): string {
  const stock = state.stockMarket.stocks[stockId];
  return `${stock.symbol} (${stock.name})`;
}

export function stockForFaction(factionId: FactionId): StockId {
  const stockMap: Record<FactionId, StockId> = {
    vega_exchange: 'vega_credit',
    sirius_guild: 'sirius_ore',
    nova_relief: 'nova_life',
    free_caravans: 'caravan_lux',
    dust_runners: 'dust_salvage',
  };

  return stockMap[factionId];
}

export function stockForTradeItem(itemId: TradeItemId): StockId {
  if (itemId === 'food' || itemId === 'water' || itemId === 'medicine') return 'nova_life';
  if (itemId === 'fuel' || itemId === 'ore') return 'sirius_ore';
  if (itemId === 'star_silk') return 'caravan_lux';
  return 'dust_salvage';
}

export function influenceStock(state: GameState, stockId: StockId, percent: number): void {
  state.stockMarket.bias[stockId] += percent;
}

export function influenceFactionStocks(state: GameState, factionId: FactionId, percent: number): void {
  influenceStock(state, stockForFaction(factionId), percent);
}

export function influenceTradeItemStock(state: GameState, itemId: TradeItemId, percent: number): void {
  influenceStock(state, stockForTradeItem(itemId), percent);
}

export function influenceBundleStocks(
  state: GameState,
  bundle: Partial<Record<string, number>>,
  direction: 1 | -1
): void {
  for (const [resourceId, amount] of Object.entries(bundle)) {
    if (resourceId === 'credits' || !amount || amount <= 0) continue;

    influenceTradeItemStock(state, resourceId as TradeItemId, direction * Math.min(0.014, amount / 800));
  }
}

export function stockPositionValue(state: GameState, stockId: StockId): number {
  const stock = state.stockMarket.stocks[stockId];
  const position = state.stockMarket.positions[stockId];

  if (!position) return 0;

  const margin = (position.averagePrice * position.shares) / position.averageLeverage;
  const leveragedProfit = (stock.price - position.averagePrice) * position.shares * position.averageLeverage;
  return Math.max(0, Math.round(margin + leveragedProfit));
}

export function stockPortfolioValue(state: GameState): number {
  return stockIds.reduce((total, stockId) => total + stockPositionValue(state, stockId), 0);
}

export function stockDayChange(state: GameState, stockId: StockId): number {
  const stock = state.stockMarket.stocks[stockId];
  const previous = stock.history.at(-2);

  return previous === undefined ? 0 : stock.price - previous;
}

export function stockDayChangePercent(state: GameState, stockId: StockId): number {
  const stock = state.stockMarket.stocks[stockId];
  const previous = stock.history.at(-2);

  if (!previous) return 0;

  return ((stock.price - previous) / previous) * 100;
}

export function applyStockMarketTurn(state: GameState): void {
  const changes: string[] = [];

  for (const stockId of stockIds) {
    const stock = state.stockMarket.stocks[stockId];
    const before = stock.price;
    const randomMove = (Math.random() * 2 - 1) * stock.volatility;
    const rawPercent = stock.drift + randomMove + stockRelationshipSupport(state, stockId) + state.stockMarket.bias[stockId];
    const clampedPercent = Math.max(-0.075, Math.min(0.075, rawPercent));

    stock.price = Math.max(4, Math.round(stock.price * (1 + clampedPercent)));
    stock.history.push(stock.price);

    if (stock.history.length > 18) {
      stock.history.shift();
    }

    state.stockMarket.bias[stockId] = 0;
    changes.push(`${stock.symbol} ${before} -> ${stock.price} (${formatSignedPercent(clampedPercent * 100)})`);
  }

  appendLog(state, `STOCK MARKET\n${changes.join('\n')}`);
}

export function buyStock(state: GameState, stockIdText: string, amountText: string): void {
  const stockId = stockIdText as StockId;
  const shares = Number(amountText);
  const stock = state.stockMarket.stocks[stockId];

  if (!stock || !Number.isInteger(shares) || shares <= 0) {
    appendLog(state, 'Invalid stock purchase. Example: stock buy vega_credit 2');
    return;
  }

  const cost = Math.ceil((stock.price * shares) / state.stockMarket.leverage);

  if (state.player.credits < cost) {
    appendLog(state, `Not enough credits. Need ${cost} credits for ${shares} ${stock.symbol} at ${state.stockMarket.leverage}x.`);
    return;
  }

  const current = state.stockMarket.positions[stockId];
  state.player.credits -= cost;

  if (current) {
    const totalShares = current.shares + shares;
    current.averagePrice = Math.round((current.averagePrice * current.shares + stock.price * shares) / totalShares);
    current.averageLeverage =
      Math.round(((current.averageLeverage * current.shares + state.stockMarket.leverage * shares) / totalShares) * 10) / 10;
    current.shares = totalShares;
  } else {
    state.stockMarket.positions[stockId] = {
      shares,
      averagePrice: stock.price,
      averageLeverage: state.stockMarket.leverage,
    };
  }

  influenceStock(state, stockId, shares > 5 ? 0.006 : 0.003);
  appendLog(state, `Bought ${shares} ${stockLabel(state, stockId)} shares at ${stock.price} credits using ${state.stockMarket.leverage}x leverage. Cost: ${cost}.`);
}

export function sellStock(state: GameState, stockIdText: string, amountText: string): void {
  const stockId = stockIdText as StockId;
  const shares = Number(amountText);
  const stock = state.stockMarket.stocks[stockId];
  const position = state.stockMarket.positions[stockId];

  if (!stock || !position || !Number.isInteger(shares) || shares <= 0) {
    appendLog(state, 'Invalid stock sale. Example: stock sell vega_credit 1');
    return;
  }

  if (position.shares < shares) {
    appendLog(state, `You only hold ${position.shares} ${stock.symbol} shares.`);
    return;
  }

  const returnedMargin = (position.averagePrice * shares) / position.averageLeverage;
  const leveragedProfit = (stock.price - position.averagePrice) * shares * position.averageLeverage;
  const payout = Math.max(0, Math.round(returnedMargin + leveragedProfit));

  state.player.credits += payout;
  position.shares -= shares;

  if (position.shares <= 0) {
    delete state.stockMarket.positions[stockId];
  }

  influenceStock(state, stockId, shares > 5 ? -0.006 : -0.003);
  appendLog(state, `Sold ${shares} ${stock.symbol} shares at ${stock.price}. Payout: ${payout} credits.`);
}

export function setStockLeverage(state: GameState, valueText: string): void {
  const value = Number(valueText);

  if (!isStockLeverage(value)) {
    appendLog(state, 'Invalid leverage. Use: leverage 1, leverage 2, or leverage 3.');
    return;
  }

  state.stockMarket.leverage = value;
  appendLog(state, `Stock leverage set to ${value}x. Higher leverage lowers entry cost but magnifies losses on sale.`);
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function stockRelationshipSupport(state: GameState, stockId: StockId): number {
  const faction = factionIds.find((factionId) => stockForFaction(factionId) === stockId) ?? 'vega_exchange';
  return Math.max(-0.012, Math.min(0.012, state.diplomacy[faction].relationship / 10000));
}

function isStockLeverage(value: number): value is StockLeverage {
  return value === 1 || value === 2 || value === 3;
}
