export type GoodId = 'medicine' | 'ore' | 'star_silk' | 'alien_relics';
export type SupplyId = 'food' | 'water' | 'fuel';
export type TradeItemId = GoodId | SupplyId;
export type BargainingResourceId = 'credits' | TradeItemId;
export type LocationId = 'vega' | 'sirius' | 'nova7';
export type StockId = 'vega_credit' | 'sirius_ore' | 'nova_life' | 'caravan_lux' | 'dust_salvage';
export type FactionId =
  | 'vega_exchange'
  | 'sirius_guild'
  | 'nova_relief'
  | 'free_caravans'
  | 'dust_runners';
export type AllianceStatus = 'none' | 'trade_pact' | 'alliance';
export type FactionStance = 'ally' | 'friendly' | 'neutral' | 'rival' | 'hostile';
export type SidebarTab = 'market' | 'ledger' | 'bargain' | 'stocks';
export type StockLeverage = 1 | 2 | 3;

export type Good = {
  id: GoodId;
  name: string;
};

export type Supply = {
  id: SupplyId;
  name: string;
  warning: number;
};

export type VendorOffer = {
  itemId: TradeItemId;
  kind: 'supply' | 'good';
  ask: number;
  bid?: number;
};

export type Vendor = {
  id: string;
  name: string;
  role: string;
  factionId: FactionId;
  bio: string;
  stock: VendorOffer[];
};

export type Location = {
  id: LocationId;
  name: string;
  description: string;
  governingFaction: FactionId;
  routes: Partial<Record<LocationId, number>>;
  vendors: Vendor[];
};

export type Player = {
  day: number;
  credits: number;
  locationId: LocationId;
  cargoCapacity: number;
  supplies: Record<SupplyId, number>;
  cargo: Partial<Record<GoodId, number>>;
};

export type Stock = {
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

export type StockPosition = {
  shares: number;
  averagePrice: number;
  averageLeverage: number;
};

export type Faction = {
  id: FactionId;
  name: string;
  identity: string;
  home: string;
};

export type DiplomacyState = {
  relationship: number;
  alliance: AllianceStatus;
};

export type BargainingInventory = Partial<Record<BargainingResourceId, number>>;

export type BargainingFactionState = {
  trust: number;
  inventory: BargainingInventory;
};

export type StockMarketState = {
  stocks: Record<StockId, Stock>;
  positions: Partial<Record<StockId, StockPosition>>;
  leverage: StockLeverage;
  bias: Record<StockId, number>;
};

export type RippleEntry = {
  factionId: FactionId;
  change: number;
};

export type EventChoice = {
  command: string;
  label: string;
  effect: (state: GameState) => void;
};

export type PendingEvent = {
  title: string;
  description: string;
  options: EventChoice[];
};

export type MarketSpecial = {
  vendorId: string;
  itemId: TradeItemId;
  type: 'discount' | 'buyback';
  description: string;
};

export type GameState = {
  player: Player;
  diplomacy: Record<FactionId, DiplomacyState>;
  bargaining: {
    selectedFactionId: FactionId;
    message: string;
    pendingOffer?: unknown;
    pendingResult?: unknown;
    factionStates: Record<FactionId, BargainingFactionState>;
  };
  stockMarket: StockMarketState;
  gameOver: boolean;
  gameOverReason: string;
  pendingEvent: PendingEvent | null;
  activeSpecial: MarketSpecial | null;
  activeSidebarTab: SidebarTab;
  selectedVendorId: string | null;
  log: string[];
};
