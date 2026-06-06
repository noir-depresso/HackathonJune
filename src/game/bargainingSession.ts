import { bargainingProfiles } from '../data/bargainingProfiles';
import { factionIds, factionLinks, factions } from '../data/factions';
import type { BargainingFactionState, BargainingInventory, FactionId, GameState, GoodId, SupplyId } from '../types';
import { generateDialogue } from './dialogue';
import { generateBargainingAIMessage, generateFactionChatMessage, requestStructuredBargainingIntent } from './bargainingAI';
import { createNegotiationFaction, evaluateOffer } from './negotiation';
import type { Faction, NegotiationOffer, NegotiationResult, ResourceBundle, ResourceId } from './negotiation';
import { evaluateStructuredBargain } from './freeformBargaining';
import { currentVendor } from './gameState';
import { relationshipDeltaAfterTrade } from './relationships';
import type { RelationshipStats } from './relationships';
import { influenceBundleStocks, influenceFactionStocks } from './stockMarket';
import { applyTradeToInventories } from './trade';
import type { Inventory } from './trade';
import type { BargainingPanelState } from '../ui/bargainingUI';

export function createInitialBargainingState(): GameState['bargaining'] {
  const factionStates = factionIds.reduce(
    (states, factionId) => {
      states[factionId] = {
        trust: bargainingProfiles[factionId].startingTrust,
        inventory: { ...bargainingProfiles[factionId].startingInventory },
      };
      return states;
    },
    {} as Record<FactionId, BargainingFactionState>
  );

  return {
    selectedFactionId: 'vega_exchange',
    message: 'Bargaining channel ready. Choose a known faction and transmit a structured offer.',
    factionStates,
  };
}

export function getBargainingPanelState(state: GameState): BargainingPanelState {
  const selectedFactionId = coerceFactionId(state.bargaining.selectedFactionId);

  return {
    factions: factionIds.map((factionId) => {
      const factionState = state.bargaining.factionStates[factionId];
      return {
        id: factionId,
        name: factions[factionId].name,
        relationship: state.diplomacy[factionId].relationship,
        trust: factionState.trust,
        inventory: factionState.inventory as ResourceBundle,
      };
    }),
    selectedFactionId,
    playerInventory: playerInventoryToResourceBundle(state),
    message: state.bargaining.message,
    pendingOffer: state.bargaining.pendingOffer as NegotiationOffer | undefined,
    pendingResult: state.bargaining.pendingResult as NegotiationResult | undefined,
  };
}

export function selectBargainingFaction(state: GameState, factionId: FactionId): void {
  state.bargaining.selectedFactionId = coerceFactionId(factionId);
  state.bargaining.pendingOffer = undefined;
  state.bargaining.pendingResult = undefined;
  state.bargaining.message = `${factions[state.bargaining.selectedFactionId].name}: Channel open. State your offer.`;
}

export async function submitBargainingOffer(state: GameState, offer: NegotiationOffer): Promise<void> {
  const factionId = coerceFactionId(offer.toFaction);
  const normalizedOffer = { ...offer, toFaction: factionId };
  const faction = negotiationFactionFromState(state, factionId);
  const vendor = bargainVendorContext(state, factionId);
  const result = evaluateOffer(normalizedOffer, faction);
  const fallbackDialogue = generateDialogue(result, faction.name);

  state.bargaining.selectedFactionId = factionId;
  state.bargaining.pendingOffer = normalizedOffer;
  state.bargaining.pendingResult = result;
  state.bargaining.message = await generateBargainingAIMessage({
    factionName: faction.name,
    factionIdeology: faction.ideology,
    factionPersonality: faction.personality,
    vendorName: vendor.name,
    vendorRole: vendor.role,
    vendorBio: vendor.bio,
    personalityPass: pickPersonalityPass(faction),
    relationship: state.diplomacy[factionId].relationship,
    trust: state.bargaining.factionStates[factionId].trust,
    offer: normalizedOffer,
    result,
    fallbackDialogue,
  });

  if (result.outcome === 'reject') {
    applyStandingDelta(state, factionId, relationshipDeltaAfterTrade(result), false);
  }
}

export async function submitFreeformBargainingMessage(state: GameState, message: string): Promise<void> {
  state.activeSidebarTab = 'bargain';
  state.bargaining.message = 'Parsing your message into a concrete bargain...';

  const factionStates = negotiationFactionSnapshot(state);
  const selectedFactionId = coerceFactionId(state.bargaining.selectedFactionId);
  const structured = await requestStructuredBargainingIntent({
    message,
    selectedFactionId,
    factionAliases: factionAliases(),
    playerInventory: playerInventoryToResourceBundle(state),
    factionInventories: factionInventorySnapshot(state),
    factionProfiles: factionProfileSnapshot(state),
  });
  const freeformResult = evaluateStructuredBargain(structured, factionStates, playerInventoryToResourceBundle(state));
  const faction = factionStates[structured.toFaction];
  const vendor = bargainVendorContext(state, structured.toFaction);

  state.bargaining.selectedFactionId = structured.toFaction;
  state.bargaining.pendingOffer =
    freeformResult.computedResult.outcome === 'accept' || freeformResult.computedResult.outcome === 'counteroffer'
      ? freeformResult.offer
      : undefined;
  state.bargaining.pendingResult = freeformResult.computedResult;

  applyNegotiationReputationDelta(state, structured.toFaction, freeformResult.audit.reputationDelta);

  if (!freeformResult.offer) {
    const missing = structured.missingInfo.join(', ') || 'a clear offer';
    state.bargaining.message = /\d/.test(message)
      ? `${faction.name}: Clarify ${missing}.`
      : await generateFactionChatMessage({
          message,
          factionName: faction.name,
          factionIdeology: faction.ideology,
          factionPersonality: faction.personality,
          vendorName: vendor.name,
          vendorRole: vendor.role,
          vendorBio: vendor.bio,
          relationship: faction.relationship,
          trust: faction.trust,
          voiceStyle: faction.voiceStyle,
          personalityPass: freeformResult.audit.personalityPass,
          playerInventory: playerInventoryToResourceBundle(state),
          factionInventory: faction.inventory,
          lastBargainingMessage: state.bargaining.message,
        });
    state.log.push(`BARGAIN CHAT\n${state.bargaining.message}`);
    return;
  }

  const fallbackDialogue = generateDialogue(freeformResult.computedResult, faction.name);
  state.bargaining.message = await generateBargainingAIMessage({
    factionName: faction.name,
    factionIdeology: faction.ideology,
    factionPersonality: faction.personality,
    vendorName: vendor.name,
    vendorRole: vendor.role,
    vendorBio: vendor.bio,
    personalityPass: freeformResult.audit.personalityPass,
    relationship: faction.relationship,
    trust: faction.trust,
    offer: freeformResult.offer,
    result: freeformResult.computedResult,
    fallbackDialogue,
    structuredIntent: structured,
    audit: freeformResult.audit,
  });

  state.log.push(`BARGAIN CHAT\n${state.bargaining.message}`);

  if (freeformResult.computedResult.outcome === 'accept') {
    completeOffer(state, freeformResult.offer, freeformResult.computedResult);
  }
}

export function confirmBargainingOffer(state: GameState): void {
  const offer = state.bargaining.pendingOffer as NegotiationOffer | undefined;
  const result = state.bargaining.pendingResult as NegotiationResult | undefined;

  if (!offer || !result || result.outcome !== 'accept') {
    state.bargaining.message = 'No accepted offer is ready to confirm.';
    return;
  }

  completeOffer(state, offer, result);
}

export function acceptCounteroffer(state: GameState): void {
  const result = state.bargaining.pendingResult as NegotiationResult | undefined;

  if (!result?.counteroffer) {
    state.bargaining.message = 'No counteroffer is available.';
    return;
  }

  completeOffer(state, result.counteroffer, result);
}

export function cancelBargainingOffer(state: GameState): void {
  state.bargaining.pendingOffer = undefined;
  state.bargaining.pendingResult = undefined;
  state.bargaining.message = 'Offer cancelled. Revise your terms and transmit again.';
}

function completeOffer(state: GameState, offer: NegotiationOffer, result: NegotiationResult): void {
  const factionId = coerceFactionId(offer.toFaction);
  const faction = negotiationFactionFromState(state, factionId);
  const playerInventory = playerInventoryToResourceBundle(state);

  if (cargoAfterOffer(state, offer) > state.player.cargoCapacity) {
    state.bargaining.message = 'Not enough cargo space for the requested goods.';
    return;
  }

  const tradeResult = applyTradeToInventories(playerInventory, faction.inventory, offer.offered, offer.requested);

  if (!tradeResult.success) {
    state.bargaining.message = tradeResult.message;
    return;
  }

  applyResourceBundleToPlayer(state, playerInventory);
  state.bargaining.factionStates[factionId].inventory = faction.inventory as BargainingInventory;

  const standingDelta = relationshipDeltaAfterTrade(result);
  const ripple = applyStandingDelta(state, factionId, standingDelta, true);
  influenceBundleStocks(state, offer.requested, 1);
  influenceBundleStocks(state, offer.offered, -1);
  influenceFactionStocks(state, factionId, 0.006);

  state.bargaining.pendingOffer = undefined;
  state.bargaining.pendingResult = undefined;
  state.bargaining.message = `${faction.name}: ${tradeResult.message} Relationship ripple: ${ripple}. Trust ${formatSigned(
    standingDelta.trust
  )}.`;
  state.log.push(`BARGAIN COMPLETE\n${state.bargaining.message}`);
}

function negotiationFactionFromState(state: GameState, factionId: FactionId): Faction {
  const factionState = state.bargaining.factionStates[factionId];
  return createNegotiationFaction(
    factionId,
    state.diplomacy[factionId].relationship,
    factionState.trust,
    factionState.inventory
  );
}

function bargainVendorContext(state: GameState, factionId: FactionId): { name: string; role: string; bio: string } {
  try {
    const vendor = currentVendor(state);

    if (vendor.factionId === factionId) {
      return {
        name: vendor.name,
        role: vendor.role,
        bio: vendor.bio,
      };
    }
  } catch {
    // Fall through to a faction-level negotiator when no vendor is selected.
  }

  return {
    name: `${factions[factionId].name} Negotiator`,
    role: 'Faction Envoy',
    bio: factions[factionId].identity,
  };
}

function negotiationFactionSnapshot(state: GameState): Record<FactionId, Faction> {
  return factionIds.reduce(
    (snapshot, factionId) => {
      snapshot[factionId] = negotiationFactionFromState(state, factionId);
      return snapshot;
    },
    {} as Record<FactionId, Faction>
  );
}

function factionInventorySnapshot(state: GameState): Record<FactionId, ResourceBundle> {
  return factionIds.reduce(
    (snapshot, factionId) => {
      snapshot[factionId] = state.bargaining.factionStates[factionId].inventory as ResourceBundle;
      return snapshot;
    },
    {} as Record<FactionId, ResourceBundle>
  );
}

function factionProfileSnapshot(state: GameState): Record<FactionId, unknown> {
  return factionIds.reduce(
    (snapshot, factionId) => {
      const faction = negotiationFactionFromState(state, factionId);
      snapshot[factionId] = {
        name: faction.name,
        ideology: faction.ideology,
        personality: faction.personality,
        voiceStyle: faction.voiceStyle,
        personalityPasses: faction.personalityPasses,
        reputationRules: faction.reputationRules,
        relationship: faction.relationship,
        trust: faction.trust,
        politicalStances: faction.politicalStances,
        philosophy: faction.philosophy,
        bargainingStyle: faction.bargainingStyle,
      };
      return snapshot;
    },
    {} as Record<FactionId, unknown>
  );
}

function factionAliases(): Record<string, FactionId> {
  return {
    vega: 'vega_exchange',
    exchange: 'vega_exchange',
    vega_exchange: 'vega_exchange',
    sirius: 'sirius_guild',
    guild: 'sirius_guild',
    sirius_guild: 'sirius_guild',
    nova: 'nova_relief',
    relief: 'nova_relief',
    collective: 'nova_relief',
    nova_relief: 'nova_relief',
    caravan: 'free_caravans',
    caravans: 'free_caravans',
    free_caravans: 'free_caravans',
    dust: 'dust_runners',
    runners: 'dust_runners',
    dust_runners: 'dust_runners',
  };
}

function playerInventoryToResourceBundle(state: GameState): ResourceBundle {
  return {
    credits: state.player.credits,
    food: state.player.supplies.food,
    water: state.player.supplies.water,
    fuel: state.player.supplies.fuel,
    medicine: state.player.cargo.medicine ?? 0,
    ore: state.player.cargo.ore ?? 0,
    star_silk: state.player.cargo.star_silk ?? 0,
    alien_relics: state.player.cargo.alien_relics ?? 0,
  };
}

function applyResourceBundleToPlayer(state: GameState, inventory: Inventory): void {
  state.player.credits = Math.max(0, Math.floor(inventory.credits ?? 0));

  for (const supplyId of ['food', 'water', 'fuel'] as SupplyId[]) {
    state.player.supplies[supplyId] = Math.max(0, Math.floor(inventory[supplyId as ResourceId] ?? 0));
  }

  for (const goodId of ['medicine', 'ore', 'star_silk', 'alien_relics'] as GoodId[]) {
    const amount = Math.max(0, Math.floor(inventory[goodId as ResourceId] ?? 0));

    if (amount > 0) {
      state.player.cargo[goodId] = amount;
    } else {
      delete state.player.cargo[goodId];
    }
  }
}

function cargoAfterOffer(state: GameState, offer: NegotiationOffer): number {
  const currentCargo = Object.values(state.player.cargo).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const outgoingGoods = sumGoods(offer.offered);
  const incomingGoods = sumGoods(offer.requested);
  return currentCargo - outgoingGoods + incomingGoods;
}

function sumGoods(bundle: ResourceBundle): number {
  return (['medicine', 'ore', 'star_silk', 'alien_relics'] as ResourceId[]).reduce(
    (sum, resourceId) => sum + (bundle[resourceId] ?? 0),
    0
  );
}

function applyStandingDelta(
  state: GameState,
  primaryFaction: FactionId,
  delta: RelationshipStats,
  includeFactionRipple: boolean
): string {
  const entries = includeFactionRipple
    ? bargainingRippleEntries(primaryFaction, delta.relationship)
    : [{ factionId: primaryFaction, change: delta.relationship }];

  for (const entry of entries) {
    state.diplomacy[entry.factionId].relationship = clamp(
      state.diplomacy[entry.factionId].relationship + entry.change,
      -100,
      100
    );
  }

  const factionState = state.bargaining.factionStates[primaryFaction];
  factionState.trust = clamp(factionState.trust + delta.trust, 0, 100);

  return entries.map((entry) => `${formatSigned(entry.change)} ${factions[entry.factionId].name}`).join(', ');
}

function applyNegotiationReputationDelta(state: GameState, factionId: FactionId, delta: number): void {
  if (delta === 0) return;

  state.diplomacy[factionId].relationship = clamp(state.diplomacy[factionId].relationship + delta, -100, 100);
  state.bargaining.factionStates[factionId].trust = clamp(
    state.bargaining.factionStates[factionId].trust + Math.round(delta / 2),
    0,
    100
  );
  influenceFactionStocks(state, factionId, delta / 2000);
  state.log.push(
    `NEGOTIATION REPUTATION\n${factions[factionId].name} relationship ${formatSigned(delta)}. Trust now ${state.bargaining.factionStates[factionId].trust}.`
  );
}

function bargainingRippleEntries(primaryFaction: FactionId, directGain: number): { factionId: FactionId; change: number }[] {
  const entries = [{ factionId: primaryFaction, change: directGain }];

  for (const factionId of factionIds) {
    if (factionId === primaryFaction) continue;

    const stance = factionLinks[primaryFaction][factionId] ?? factionLinks[factionId][primaryFaction] ?? 'neutral';
    let change = 0;

    if (stance === 'ally' || stance === 'friendly') change = 1;
    else if (stance === 'rival') change = -1;
    else if (stance === 'hostile') change = -2;

    if (change !== 0) {
      entries.push({ factionId, change });
    }
  }

  return entries;
}

function coerceFactionId(id: string): FactionId {
  if ((factionIds as readonly string[]).includes(id)) {
    return id as FactionId;
  }

  return 'vega_exchange';
}

function pickPersonalityPass(faction: Faction): string {
  if (faction.relationship >= 45 || faction.trust >= 65) {
    return faction.personalityPasses.trusted ?? faction.personality;
  }

  if (faction.relationship < -10 || faction.trust < 25) {
    return faction.personalityPasses.distrusted ?? faction.personality;
  }

  return faction.personalityPasses.neutral ?? faction.personality;
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
