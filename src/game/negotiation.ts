import factions from '../data/factions.json';
import resources from '../data/resources.json';
import rules from '../data/bargainingRules.json';

export type FactionId = keyof typeof factions;
export type ResourceId = keyof typeof resources;
export type ResourceBundle = Partial<Record<ResourceId, number>>;

export type NegotiationOffer = {
  fromFaction: 'player';
  toFaction: FactionId;
  offered: ResourceBundle;
  requested: ResourceBundle;
};

export type NegotiationOutcome = 'accept' | 'reject' | 'counteroffer';

export type NegotiatorJudgment = {
  band:
    | 'hard_decline'
    | 'soft_decline'
    | 'weak_accept'
    | 'uneasy_accept'
    | 'fair_accept'
    | 'favored_accept'
    | 'certain_accept'
    | 'suspicious';
  acceptanceChance: number;
  acceptanceRoll: number;
  generosityRatio: number;
  reputationChance: number;
  reputationRoll: number;
  reputationDelta: number;
  reputationReasons: string[];
  haggled: boolean;
};

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
  negotiator?: NegotiatorJudgment;
};

export type Faction = (typeof factions)[FactionId];

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
  return applyNegotiatorJudgment(evaluateOfferBaseline(offer, factionOverride), offer, factionOverride);
}

export function evaluateOfferBaseline(offer: NegotiationOffer, factionOverride?: Faction): NegotiationResult {
  const faction = factionOverride ?? factions[offer.toFaction];
  const tabooResource = findTabooResource(offer.offered, faction);
  const offeredValue = calculateBundleValue(offer.offered, faction);
  const requestedValue = calculateBundleValue(offer.requested, faction);
  const shortageResource = findShortageResource(offer.requested, faction);

  let score = ((offeredValue - requestedValue) / Math.max(1, requestedValue)) * 100;
  score += faction.relationshipWithPlayer * rules.relationshipMultiplier;
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

  return {
    outcome: 'reject',
    reason: 'bad_value',
    score,
    offeredValue,
    requestedValue,
  };
}

export function applyNegotiatorJudgment(
  result: NegotiationResult,
  offer: NegotiationOffer | undefined,
  factionOverride?: Faction
): NegotiationResult {
  if (!offer || result.reason === 'taboo' || result.reason === 'shortage' || result.reason === 'lie_detected') {
    return result;
  }

  const faction = factionOverride ?? factions[offer.toFaction];
  const generosityRatio = result.offeredValue / Math.max(1, result.requestedValue);

  if (isSuspiciouslyGenerous(result, faction)) {
    return {
      ...result,
      outcome: faction.overlyGoodDealPolicy === 'decline' ? 'reject' : 'counteroffer',
      reason: 'overly_good_suspicious',
      counteroffer:
        faction.overlyGoodDealPolicy === 'decline'
          ? undefined
          : generateSuspiciousCounteroffer(offer),
      negotiator: {
        band: 'suspicious',
        acceptanceChance: 0,
        acceptanceRoll: 1,
        generosityRatio,
        reputationChance: 0,
        reputationRoll: 1,
        reputationDelta: 0,
        reputationReasons: ['offer was generous enough to look like a trap'],
        haggled: faction.overlyGoodDealPolicy !== 'decline',
      },
    };
  }

  const acceptance = acceptanceProfile(result.score, faction);
  const acceptanceRoll = Math.random();
  const accepted = acceptance.chance >= 1 || (acceptance.chance > 0 && acceptanceRoll <= acceptance.chance);
  const reputation = accepted
    ? reputationProfile(result.score, result.offeredValue, result.requestedValue, faction)
    : { chance: 0, roll: 1, delta: 0, reasons: [] };

  const negotiator: NegotiatorJudgment = {
    band: acceptance.band,
    acceptanceChance: acceptance.chance,
    acceptanceRoll,
    generosityRatio,
    reputationChance: reputation.chance,
    reputationRoll: reputation.roll,
    reputationDelta: reputation.delta,
    reputationReasons: reputation.reasons,
    haggled: !accepted && result.score >= judgmentRules(faction).hardDeclineScore,
  };

  if (accepted) {
    return {
      ...result,
      outcome: 'accept',
      reason: 'fair',
      counteroffer: undefined,
      negotiator,
    };
  }

  if (negotiator.haggled) {
    return {
      ...result,
      outcome: 'counteroffer',
      reason: 'low_value',
      counteroffer: generateCounteroffer(offer, faction, result.score),
      negotiator,
    };
  }

  return {
    ...result,
    outcome: 'reject',
    reason: 'bad_value',
    counteroffer: undefined,
    negotiator,
  };
}

export function getFaction(factionId: FactionId): Faction {
  return factions[factionId];
}

type NegotiatorJudgmentRules = typeof rules.negotiatorJudgment;

function judgmentRules(faction?: Faction): NegotiatorJudgmentRules {
  const override = faction
    ? (faction as Faction & { negotiatorJudgment?: Partial<NegotiatorJudgmentRules> }).negotiatorJudgment
    : undefined;

  return {
    ...rules.negotiatorJudgment,
    ...(override ?? {}),
  };
}

function isSuspiciouslyGenerous(result: NegotiationResult, faction: Faction): boolean {
  return (
    result.requestedValue > 0 &&
    result.offeredValue / result.requestedValue >= faction.overlyGoodDealMultiplier &&
    faction.overlyGoodDealPolicy !== 'accept'
  );
}

function acceptanceProfile(
  score: number,
  faction: Faction
): { band: NegotiatorJudgment['band']; chance: number } {
  const judgment = judgmentRules(faction);
  const riskTolerance = clamp(faction.riskTolerance, 0.7, 1.25);

  if (score < judgment.hardDeclineScore) {
    return { band: 'hard_decline', chance: 0 };
  }

  if (score < judgment.softDeclineScore) {
    return { band: 'soft_decline', chance: adjustedChance(judgment.softDeclineChance, riskTolerance) };
  }

  if (score < judgment.weakAcceptScore) {
    return { band: 'weak_accept', chance: adjustedChance(judgment.weakAcceptChance, riskTolerance) };
  }

  if (score < judgment.uneasyAcceptScore) {
    return { band: 'uneasy_accept', chance: adjustedChance(judgment.uneasyAcceptChance, riskTolerance) };
  }

  if (score < judgment.fairAcceptScore) {
    return { band: 'fair_accept', chance: adjustedChance(judgment.fairAcceptChance, riskTolerance) };
  }

  if (score < judgment.favoredAcceptScore) {
    return { band: 'fair_accept', chance: adjustedChance(judgment.fairAcceptChance, riskTolerance) };
  }

  if (score < judgment.certainAcceptScore) {
    return { band: 'favored_accept', chance: adjustedChance(judgment.favoredAcceptChance, riskTolerance) };
  }

  return { band: 'certain_accept', chance: 1 };
}

function adjustedChance(chance: number, riskTolerance: number): number {
  return clamp(chance * riskTolerance, 0, 0.95);
}

function reputationProfile(
  score: number,
  offeredValue: number,
  requestedValue: number,
  faction: Faction
): { chance: number; roll: number; delta: number; reasons: string[] } {
  const judgment = judgmentRules(faction);
  const economicScore = ((offeredValue - requestedValue) / Math.max(1, requestedValue)) * 100;
  const generosityScore = Math.max(score, economicScore);

  if (generosityScore < judgment.generousScore) {
    return { chance: 0, roll: 1, delta: 0, reasons: [] };
  }

  const chance =
    generosityScore >= judgment.legendaryScore
      ? 1
      : generosityScore >= judgment.excellentScore
        ? 0.6
        : 0.25;
  const roll = Math.random();

  if (roll > chance) {
    return { chance, roll, delta: 0, reasons: [] };
  }

  const generosityRange = Math.max(1, judgment.legendaryScore - judgment.generousScore);
  const scaled = Math.ceil(
    ((Math.min(generosityScore, judgment.legendaryScore) - judgment.generousScore) / generosityRange) *
      judgment.maxReputationBonus
  );
  const delta = Math.max(1, Math.min(judgment.maxReputationBonus, scaled));

  return {
    chance,
    roll,
    delta,
    reasons: ['accepted a generous bargain'],
  };
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
  const multiplier =
    score < -10 ? rules.maxCounterofferMultiplier : rules.minCounterofferMultiplier;

  if (bestOfferedResource) {
    counteroffer.offered[bestOfferedResource] = Math.ceil(
      (counteroffer.offered[bestOfferedResource] ?? 0) * multiplier
    );
    return counteroffer;
  }

  const urgentResource = faction.urgentNeeds.find((resourceId) => resourceId in resources) as
    | ResourceId
    | undefined;

  if (urgentResource) {
    counteroffer.offered[urgentResource] = Math.ceil(3 * multiplier);
  } else {
    counteroffer.offered.credits = Math.ceil(50 * multiplier);
  }

  return counteroffer;
}

function generateSuspiciousCounteroffer(offer: NegotiationOffer): NegotiationOffer {
  const counteroffer: NegotiationOffer = {
    fromFaction: offer.fromFaction,
    toFaction: offer.toFaction,
    offered: { ...offer.offered },
    requested: { ...offer.requested },
  };
  const mostValuableOffered = Object.keys(counteroffer.offered).sort((left, right) => {
    const leftValue =
      (resources[left as ResourceId]?.baseValue ?? 0) * (counteroffer.offered[left as ResourceId] ?? 0);
    const rightValue =
      (resources[right as ResourceId]?.baseValue ?? 0) * (counteroffer.offered[right as ResourceId] ?? 0);

    return rightValue - leftValue;
  })[0] as ResourceId | undefined;

  if (mostValuableOffered) {
    counteroffer.offered[mostValuableOffered] = Math.max(
      1,
      Math.floor((counteroffer.offered[mostValuableOffered] ?? 1) * 0.65)
    );
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
