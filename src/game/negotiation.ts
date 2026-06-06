import { bargainingProfiles } from '../data/bargainingProfiles';
import type { BargainingProfile } from '../data/bargainingProfiles';
import { factions } from '../data/factions';
import resources from '../data/resources.json';
import rules from '../data/bargainingRules.json';
import type { BargainingInventory, Faction as LocalFaction, FactionId } from '../types';

export type { FactionId } from '../types';
export type ResourceId = keyof typeof resources;
export type ResourceBundle = Partial<Record<ResourceId, number>>;

export type NegotiationOffer = {
  fromFaction: 'player';
  toFaction: FactionId;
  offered: ResourceBundle;
  requested: ResourceBundle;
};

export type NegotiationOutcome = 'accept' | 'reject' | 'counteroffer';

export type NegotiationResult = {
  outcome: NegotiationOutcome;
  reason:
    | 'fair'
    | 'low_value'
    | 'bad_value'
    | 'taboo'
    | 'shortage'
    | 'lie_detected'
    | 'overly_good_suspicious';
  score: number;
  offeredValue: number;
  requestedValue: number;
  counteroffer?: NegotiationOffer;
  reasonResource?: ResourceId;
};

export type Faction = LocalFaction &
  BargainingProfile & {
    relationship: number;
    trust: number;
    inventory: ResourceBundle;
  };

export function createNegotiationFaction(
  factionId: FactionId,
  relationship = 0,
  trust = bargainingProfiles[factionId].startingTrust,
  inventory: BargainingInventory = bargainingProfiles[factionId].startingInventory
): Faction {
  return {
    ...factions[factionId],
    ...bargainingProfiles[factionId],
    relationship,
    trust,
    inventory: { ...inventory } as ResourceBundle,
  };
}

export function calculateResourceValue(resourceId: ResourceId, amount: number, faction: Faction): number {
  const resource = resources[resourceId];
  let value = resource.baseValue * amount;

  if ((faction.likes as readonly string[]).includes(resourceId)) {
    value *= rules.likedResourceMultiplier;
  }

  if ((faction.dislikes as readonly string[]).includes(resourceId)) {
    value *= rules.dislikedResourceMultiplier;
  }

  if ((faction.urgentNeeds as readonly string[]).includes(resourceId)) {
    value *= rules.urgentNeedMultiplier;
  }

  if ((faction.tabooResources as readonly string[]).includes(resourceId)) {
    value -= rules.tabooPenalty;
  }

  return value;
}

export function calculateBundleValue(bundle: ResourceBundle, faction: Faction): number {
  return Object.entries(bundle).reduce((total, [resourceId, amount]) => {
    if (!amount || amount <= 0) {
      return total;
    }

    return total + calculateResourceValue(resourceId as ResourceId, amount, faction);
  }, 0);
}

export function evaluateOffer(offer: NegotiationOffer, factionOverride?: Faction): NegotiationResult {
  const faction = factionOverride ?? getFaction(offer.toFaction);
  const tabooResource = findTabooResource(offer.offered, faction);
  const offeredValue = calculateBundleValue(offer.offered, faction);
  const requestedValue = calculateBundleValue(offer.requested, faction);
  const shortageResource = findShortageResource(offer.requested, faction);

  let score = ((offeredValue - requestedValue) / Math.max(1, requestedValue)) * 100;
  score += faction.relationship * rules.relationshipMultiplier;
  score += faction.trust * rules.trustMultiplier;
  score /= faction.greed;

  if (tabooResource) {
    return {
      outcome: 'reject',
      reason: 'taboo',
      score,
      offeredValue,
      requestedValue,
      reasonResource: tabooResource,
    };
  }

  if (shortageResource) {
    return {
      outcome: 'reject',
      reason: 'shortage',
      score,
      offeredValue,
      requestedValue,
      reasonResource: shortageResource,
    };
  }

  if (score >= rules.acceptThreshold) {
    return {
      outcome: 'accept',
      reason: 'fair',
      score,
      offeredValue,
      requestedValue,
    };
  }

  if (score >= rules.counterofferThreshold) {
    return {
      outcome: 'counteroffer',
      reason: 'low_value',
      score,
      offeredValue,
      requestedValue,
      counteroffer: generateCounteroffer(offer, faction, score),
    };
  }

  return {
    outcome: 'reject',
    reason: 'bad_value',
    score,
    offeredValue,
    requestedValue,
  };
}

export function getFaction(factionId: FactionId): Faction {
  return createNegotiationFaction(factionId);
}

function findTabooResource(bundle: ResourceBundle, faction: Faction): ResourceId | undefined {
  return Object.keys(bundle).find((resourceId) =>
    (faction.tabooResources as readonly string[]).includes(resourceId)
  ) as ResourceId | undefined;
}

function findShortageResource(bundle: ResourceBundle, faction: Faction): ResourceId | undefined {
  return Object.entries(bundle).find(([resourceId, amount]) => {
    const available = faction.inventory[resourceId as ResourceId] ?? 0;
    return (amount ?? 0) > available;
  })?.[0] as ResourceId | undefined;
}

function generateCounteroffer(offer: NegotiationOffer, faction: Faction, score: number): NegotiationOffer {
  const counteroffer: NegotiationOffer = {
    fromFaction: offer.fromFaction,
    toFaction: offer.toFaction,
    offered: { ...offer.offered },
    requested: { ...offer.requested },
  };

  const bestOfferedResource = chooseBestCounterResource(counteroffer.offered, faction);
  const multiplier = score < -10 ? rules.maxCounterofferMultiplier : rules.minCounterofferMultiplier;

  if (bestOfferedResource) {
    counteroffer.offered[bestOfferedResource] = Math.ceil(
      (counteroffer.offered[bestOfferedResource] ?? 0) * multiplier
    );
    return counteroffer;
  }

  const urgentResource = faction.urgentNeeds.find((resourceId) => resourceId in resources) as ResourceId | undefined;

  if (urgentResource) {
    counteroffer.offered[urgentResource] = Math.ceil(3 * multiplier);
  } else {
    counteroffer.offered.credits = Math.ceil(50 * multiplier);
  }

  return counteroffer;
}

function chooseBestCounterResource(bundle: ResourceBundle, faction: Faction): ResourceId | undefined {
  const resourceIds = Object.keys(bundle) as ResourceId[];

  return resourceIds.sort((left, right) => {
    const leftValue = calculateResourceValue(left, bundle[left] ?? 0, faction);
    const rightValue = calculateResourceValue(right, bundle[right] ?? 0, faction);
    return rightValue - leftValue;
  })[0];
}
