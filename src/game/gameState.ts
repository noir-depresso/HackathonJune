import { factions } from '../data/factions';
import { locations } from '../data/locations';
import { supplies } from '../data/items';
import { initialStocks, stockIds } from '../data/stocks';
import { createInitialBargainingState } from './bargainingSession';
import type {
  AllianceStatus,
  FactionId,
  GameState,
  GoodId,
  Location,
  LocationId,
  SupplyId,
  Vendor,
} from '../types';

export function createInitialState(): GameState {
  return {
    player: {
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
    },
    diplomacy: {
      vega_exchange: { relationship: 35, alliance: 'trade_pact' },
      sirius_guild: { relationship: 8, alliance: 'none' },
      nova_relief: { relationship: 22, alliance: 'none' },
      free_caravans: { relationship: 18, alliance: 'none' },
      dust_runners: { relationship: -6, alliance: 'none' },
    },
    bargaining: createInitialBargainingState(),
    stockMarket: {
      stocks: structuredClone(initialStocks),
      positions: {},
      leverage: 1,
      bias: stockIds.reduce(
        (bias, stockId) => {
          bias[stockId] = 0;
          return bias;
        },
        {} as GameState['stockMarket']['bias']
      ),
    },
    gameOver: false,
    gameOverReason: '',
    pendingEvent: null,
    activeSpecial: null,
    activeSidebarTab: 'market',
    stockPopupOpen: false,
    selectedVendorId: locations.vega.vendors[0].id,
    log: [],
  };
}

export function appendLog(state: GameState, message: string): void {
  state.log.push(message);
}

export function currentLocation(state: GameState): Location {
  return locations[state.player.locationId];
}

export function vendorsAtLocation(state: GameState, locationId = state.player.locationId): Vendor[] {
  return locations[locationId].vendors;
}

export function ensureSelectedVendor(state: GameState): void {
  const vendors = vendorsAtLocation(state);

  if (vendors.length === 0) {
    state.selectedVendorId = null;
    return;
  }

  if (!vendors.some((vendor) => vendor.id === state.selectedVendorId)) {
    state.selectedVendorId = vendors[0].id;
  }
}

export function currentVendor(state: GameState): Vendor {
  ensureSelectedVendor(state);
  const vendor = vendorsAtLocation(state).find((entry) => entry.id === state.selectedVendorId);

  if (!vendor) {
    throw new Error('No active vendor available.');
  }

  return vendor;
}

export function cargoUsed(state: GameState): number {
  return Object.values(state.player.cargo).reduce((sum, amount) => sum + (amount ?? 0), 0);
}

export function countAlliances(state: GameState, status: AllianceStatus): number {
  return Object.values(state.diplomacy).filter((entry) => entry.alliance === status).length;
}

export function incomePerTurn(state: GameState): number {
  return 120 + countAlliances(state, 'trade_pact') * 25 + countAlliances(state, 'alliance') * 60;
}

export function adjustRelationship(state: GameState, factionId: FactionId, change: number): void {
  state.diplomacy[factionId].relationship = Math.max(
    -100,
    Math.min(100, state.diplomacy[factionId].relationship + change)
  );
}

export function loseCredits(state: GameState, amount: number): number {
  const actual = Math.min(state.player.credits, amount);
  state.player.credits -= actual;
  return actual;
}

export function loseSupply(state: GameState, supplyId: SupplyId, amount: number): number {
  const actual = Math.min(state.player.supplies[supplyId], amount);
  state.player.supplies[supplyId] -= actual;
  return actual;
}

export function gainSupply(state: GameState, supplyId: SupplyId, amount: number): void {
  state.player.supplies[supplyId] += amount;
}

export function gainCargo(state: GameState, goodId: GoodId, amount: number): void {
  state.player.cargo[goodId] = (state.player.cargo[goodId] ?? 0) + amount;
}

export function checkGameOver(state: GameState): void {
  if (state.gameOver) return;

  for (const supply of Object.values(supplies)) {
    if (state.player.supplies[supply.id] < supply.warning) {
      state.gameOver = true;
      state.gameOverReason = `${supply.name} fell below the safe reserve line (${supply.warning}).`;
      appendLog(state, `GAME OVER\n${state.gameOverReason}`);
      return;
    }
  }
}

export function consumeSupplies(state: GameState): void {
  state.player.supplies.food = Math.max(0, state.player.supplies.food - 2);
  state.player.supplies.water = Math.max(0, state.player.supplies.water - 2);
  state.player.supplies.fuel = Math.max(0, state.player.supplies.fuel - 1);
}

export function locationName(locationId: LocationId): string {
  return locations[locationId].name;
}

export function factionName(factionId: FactionId): string {
  return factions[factionId].name;
}
