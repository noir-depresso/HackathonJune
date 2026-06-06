import resources from '../data/resources.json';
import { evaluateOffer } from './negotiation';
import type { Faction, FactionId, NegotiationOffer, NegotiationResult, ResourceBundle, ResourceId } from './negotiation';
import type { Inventory } from './trade';

export type BargainingTone =
  | 'polite'
  | 'diplomatic'
  | 'aggressive'
  | 'desperate'
  | 'threatening'
  | 'deceptive';

export type PoliticalStance =
  | 'pro_faction'
  | 'anti_enemy'
  | 'neutral'
  | 'pro_independence'
  | 'corporate'
  | 'humanitarian';

export type PhilosophyAppeal =
  | 'cooperation'
  | 'humanitarian'
  | 'profit'
  | 'domination'
  | 'freedom'
  | 'science'
  | 'tradition';

export type StructuredBargainingIntent = {
  intent: 'trade_offer' | 'clarification_needed';
  toFaction: FactionId;
  offered: ResourceBundle;
  requested: ResourceBundle;
  tone: BargainingTone;
  politicalStance: PoliticalStance;
  philosophyAppeal: PhilosophyAppeal;
  proposalFrame: 'civilization_favor' | 'player_favor' | 'mutual' | 'unclear';
  claims: string[];
  confidence: number;
  missingInfo: string[];
};

export type BargainingAudit = {
  liesDetected: string[];
  shortagesDetected: string[];
  consequences: string[];
  toneBonus: number;
  politicalBonus: number;
  philosophyBonus: number;
  overlyGoodDeal: boolean;
  reputationDelta: number;
  reputationReasons: string[];
  personalityPass: string;
};

export type FreeformBargainingResult = {
  structured: StructuredBargainingIntent;
  offer?: NegotiationOffer;
  computedResult: NegotiationResult;
  audit: BargainingAudit;
};

type FactionStates = Record<FactionId, Faction>;

export const structuredBargainingSystemPrompt = `You extract bargaining requests for a space-trading game.
Always return valid JSON only. No markdown. No prose.
Use this exact shape:
{
  "intent": "trade_offer" | "clarification_needed",
  "toFaction": "vega_union" | "eclipse_combine" | "nova_frontier",
  "offered": { "credits": 0, "water": 0, "medicine": 0, "ore": 0, "fuel_cells": 0, "star_silk": 0, "alien_relics": 0 },
  "requested": { "credits": 0, "water": 0, "medicine": 0, "ore": 0, "fuel_cells": 0, "star_silk": 0, "alien_relics": 0 },
  "tone": "polite" | "diplomatic" | "aggressive" | "desperate" | "threatening" | "deceptive",
  "politicalStance": "pro_faction" | "anti_enemy" | "neutral" | "pro_independence" | "corporate" | "humanitarian",
  "philosophyAppeal": "cooperation" | "humanitarian" | "profit" | "domination" | "freedom" | "science" | "tradition",
  "proposalFrame": "civilization_favor" | "player_favor" | "mutual" | "unclear",
  "claims": [],
  "confidence": 0.0,
  "missingInfo": []
}
Never decide acceptance. Game logic decides the outcome.
If a player writes a bare number before "for", treat it as credits offered.
If a player writes "fuel", treat it as fuel_cells.
Common typos like "ofer" still mean "offer".`;

export const structuredBargainingExamples: StructuredBargainingIntent[] = [
  {
    intent: 'trade_offer',
    toFaction: 'vega_union',
    offered: { credits: 200, water: 4 },
    requested: { medicine: 2 },
    tone: 'diplomatic',
    politicalStance: 'humanitarian',
    philosophyAppeal: 'cooperation',
    proposalFrame: 'mutual',
    claims: ['This deal helps both colonies survive.'],
    confidence: 0.92,
    missingInfo: [],
  },
  {
    intent: 'trade_offer',
    toFaction: 'eclipse_combine',
    offered: { ore: 10 },
    requested: { credits: 800 },
    tone: 'aggressive',
    politicalStance: 'corporate',
    philosophyAppeal: 'profit',
    proposalFrame: 'civilization_favor',
    claims: ['This will expand your monopoly.'],
    confidence: 0.88,
    missingInfo: [],
  },
  {
    intent: 'clarification_needed',
    toFaction: 'nova_frontier',
    offered: {},
    requested: {},
    tone: 'polite',
    politicalStance: 'pro_independence',
    philosophyAppeal: 'freedom',
    proposalFrame: 'unclear',
    claims: ['Independent colonies should help each other.'],
    confidence: 0.43,
    missingInfo: ['offered resources', 'requested resources'],
  },
  {
    intent: 'trade_offer',
    toFaction: 'vega_union',
    offered: { credits: 1000 },
    requested: { fuel_cells: 20 },
    tone: 'diplomatic',
    politicalStance: 'neutral',
    philosophyAppeal: 'profit',
    proposalFrame: 'unclear',
    claims: [],
    confidence: 0.8,
    missingInfo: [],
  },
];

export function extractFreeformBargainingIntent(
  message: string,
  selectedFactionId: FactionId,
  factionAliases: Record<string, FactionId>
): StructuredBargainingIntent {
  const normalizedMessage = message.toLowerCase();
  const toFaction = detectFaction(normalizedMessage, selectedFactionId, factionAliases);
  const offered = extractSideBundle(normalizedMessage, 'offer');
  const requested = extractSideBundle(normalizedMessage, 'request');
  const missingInfo: string[] = [];

  if (Object.keys(offered).length === 0) {
    missingInfo.push('offered resources');
  }

  if (Object.keys(requested).length === 0) {
    missingInfo.push('requested resources');
  }

  return {
    intent: missingInfo.length > 0 ? 'clarification_needed' : 'trade_offer',
    toFaction,
    offered,
    requested,
    tone: detectTone(normalizedMessage),
    politicalStance: detectPoliticalStance(normalizedMessage),
    philosophyAppeal: detectPhilosophyAppeal(normalizedMessage),
    proposalFrame: detectProposalFrame(normalizedMessage),
    claims: extractClaims(message),
    confidence: missingInfo.length > 0 ? 0.45 : 0.82,
    missingInfo,
  };
}

export function sanitizeStructuredIntent(
  value: unknown,
  selectedFactionId: FactionId
): StructuredBargainingIntent {
  const candidate = value as Partial<StructuredBargainingIntent>;
  const missingInfo = Array.isArray(candidate.missingInfo) ? candidate.missingInfo.map(String) : [];
  const offered = sanitizeBundle(candidate.offered);
  const requested = sanitizeBundle(candidate.requested);

  if (Object.keys(offered).length === 0 && !missingInfo.includes('offered resources')) {
    missingInfo.push('offered resources');
  }

  if (Object.keys(requested).length === 0 && !missingInfo.includes('requested resources')) {
    missingInfo.push('requested resources');
  }

  return {
    intent: missingInfo.length > 0 ? 'clarification_needed' : 'trade_offer',
    toFaction: isFactionId(candidate.toFaction) ? candidate.toFaction : selectedFactionId,
    offered,
    requested,
    tone: isTone(candidate.tone) ? candidate.tone : 'diplomatic',
    politicalStance: isPoliticalStance(candidate.politicalStance)
      ? candidate.politicalStance
      : 'neutral',
    philosophyAppeal: isPhilosophyAppeal(candidate.philosophyAppeal)
      ? candidate.philosophyAppeal
      : 'cooperation',
    proposalFrame: isProposalFrame(candidate.proposalFrame) ? candidate.proposalFrame : 'unclear',
    claims: Array.isArray(candidate.claims) ? candidate.claims.map(String) : [],
    confidence: clamp(Number(candidate.confidence) || 0.5, 0, 1),
    missingInfo,
  };
}

export function evaluateStructuredBargain(
  structured: StructuredBargainingIntent,
  factionStates: FactionStates,
  playerInventory: Inventory
): FreeformBargainingResult {
  const faction = factionStates[structured.toFaction];
  const offer: NegotiationOffer | undefined =
    structured.intent === 'trade_offer'
      ? {
          fromFaction: 'player',
          toFaction: structured.toFaction,
          offered: structured.offered,
          requested: structured.requested,
        }
      : undefined;

  const baseResult = offer
    ? evaluateOffer(offer, faction)
    : emptyResult('low_value');

  const audit = auditStructuredBargain(structured, faction, playerInventory, offer);
  const computedResult = applyAuditToResult(baseResult, structured, faction, audit, offer);

  return {
    structured,
    offer,
    computedResult,
    audit,
  };
}

function auditStructuredBargain(
  structured: StructuredBargainingIntent,
  faction: Faction,
  playerInventory: Inventory,
  offer: NegotiationOffer | undefined
): BargainingAudit {
  const liesDetected: string[] = [];
  const shortagesDetected: string[] = [];
  const consequences: string[] = [];

  if (!offer) {
    return {
      liesDetected,
      shortagesDetected,
      consequences,
      toneBonus: 0,
      politicalBonus: 0,
      philosophyBonus: 0,
      overlyGoodDeal: false,
      reputationDelta: 0,
      reputationReasons: [],
      personalityPass: personalityPassFor(faction),
    };
  }

  for (const [resourceId, amount] of Object.entries(offer.offered)) {
    const available = playerInventory[resourceId as ResourceId] ?? 0;

    if ((amount ?? 0) > available) {
      liesDetected.push(`Player promised ${amount} ${resourceId} but only has ${available}.`);
    }
  }

  for (const [resourceId, amount] of Object.entries(offer.requested)) {
    const available = faction.inventory[resourceId as ResourceId] ?? 0;

    if ((amount ?? 0) > available) {
      shortagesDetected.push(`${faction.name} can only provide ${available} ${resourceId}, not ${amount}.`);
    }
  }

  if (structured.claims.some((claim) => /i have|my cargo|my stores|in my hold/i.test(claim))) {
    for (const [resourceId, amount] of Object.entries(offer.offered)) {
      const available = playerInventory[resourceId as ResourceId] ?? 0;

      if ((amount ?? 0) > available) {
        liesDetected.push(`Claimed inventory does not match scanner records for ${resourceId}.`);
      }
    }
  }

  if (liesDetected.length > 0) {
    consequences.push('Trust and relationship will drop if this negotiation is confirmed.');
  }

  if (shortagesDetected.length > 0) {
    consequences.push('Impossible requests make the negotiator less receptive.');
  }

  const toneBonus = weightedBonus(faction.tonePreferences, structured.tone, 12);
  const politicalBonus = weightedBonus(faction.politicalStances, structured.politicalStance, 12);
  const philosophyBonus = weightedBonus(faction.philosophy, structured.philosophyAppeal, 14);
  const reputation = calculateReputationDelta(structured, faction, liesDetected, shortagesDetected);

  return {
    liesDetected,
    shortagesDetected,
    consequences,
    toneBonus,
    politicalBonus,
    philosophyBonus,
    overlyGoodDeal: isOverlyGoodDeal(offer, faction),
    reputationDelta: reputation.delta,
    reputationReasons: reputation.reasons,
    personalityPass: personalityPassFor(faction),
  };
}

function applyAuditToResult(
  baseResult: NegotiationResult,
  structured: StructuredBargainingIntent,
  faction: Faction,
  audit: BargainingAudit,
  offer: NegotiationOffer | undefined
): NegotiationResult {
  let result: NegotiationResult = {
    ...baseResult,
    score: baseResult.score + audit.toneBonus + audit.politicalBonus + audit.philosophyBonus,
  };

  if (structured.intent === 'clarification_needed') {
    return {
      ...result,
      outcome: 'reject',
      reason: 'low_value',
    };
  }

  if (audit.liesDetected.length > 0) {
    result = {
      ...result,
      outcome: 'reject',
      reason: 'lie_detected',
      score: result.score - faction.liePenalty,
    };
  }

  if (audit.shortagesDetected.length > 0 && result.reason !== 'lie_detected') {
    result = {
      ...result,
      outcome: 'reject',
      reason: 'shortage',
      score: Math.min(result.score, -20),
    };
  }

  if (audit.overlyGoodDeal && faction.overlyGoodDealPolicy !== 'accept') {
    result = {
      ...result,
      outcome: faction.overlyGoodDealPolicy === 'decline' ? 'reject' : 'counteroffer',
      reason: 'overly_good_suspicious',
      counteroffer:
        faction.overlyGoodDealPolicy === 'decline' || !offer
          ? undefined
          : makeSuspiciousCounteroffer(offer),
    };
  }

  return result;
}

function makeSuspiciousCounteroffer(offer: NegotiationOffer): NegotiationOffer {
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

function isOverlyGoodDeal(offer: NegotiationOffer, faction: Faction): boolean {
  const offeredValue = Object.entries(offer.offered).reduce((total, [resourceId, amount]) => {
    return total + ((resources[resourceId as ResourceId]?.baseValue ?? 0) * (amount ?? 0));
  }, 0);
  const requestedValue = Object.entries(offer.requested).reduce((total, [resourceId, amount]) => {
    return total + ((resources[resourceId as ResourceId]?.baseValue ?? 0) * (amount ?? 0));
  }, 0);

  return requestedValue > 0 && offeredValue / requestedValue >= faction.overlyGoodDealMultiplier;
}

function extractSideBundle(message: string, side: 'offer' | 'request'): ResourceBundle {
  const bundle: ResourceBundle = {};
  const text = extractTradeSideText(message, side);

  for (const resourceId of Object.keys(resources) as ResourceId[]) {
    const aliases = resourceAliases(resourceId);

    for (const alias of aliases) {
      const amountPattern = new RegExp(`(?:${alias})\\s*(\\d+)|(\\d+)\\s*(?:${alias})`, 'i');
      const amountMatch = text.match(amountPattern);

      if (amountMatch) {
        bundle[resourceId] = Number(amountMatch[1] ?? amountMatch[2]);
        break;
      }
    }
  }

  if (Object.keys(bundle).length === 0) {
    const bareAmount = text.match(/\b(\d+)\b/);

    if (bareAmount && side === 'offer') {
      bundle.credits = Number(bareAmount[1]);
    }
  }

  return bundle;
}

function extractTradeSideText(message: string, side: 'offer' | 'request'): string {
  const normalized = message
    .replace(/\bofer\b/g, 'offer')
    .replace(/\bfuel cells\b/g, 'fuel_cells')
    .replace(/\bnow\b/g, '')
    .trim();
  const forSplit = normalized.match(/^(.*?)(?:\s+for\s+)(.+)$/i);

  if (forSplit) {
    const left = cleanTradePhrase(forSplit[1]);
    const right = cleanTradePhrase(forSplit[2]);
    return side === 'offer' ? left : right;
  }

  const pattern =
    side === 'offer'
      ? /(?:offer|give|pay|trade|send|provide)\s+(.+?)(?:\s+(?:if|in exchange|to get|for your)|$)/i
      : /(?:want|need|request|ask for|get|give me|send me)\s+(.+)$/i;
  const match = normalized.match(pattern);

  return cleanTradePhrase(match?.[1] ?? '');
}

function cleanTradePhrase(text: string): string {
  return text
    .replace(/\bi want to\b/g, '')
    .replace(/\bi want\b/g, '')
    .replace(/\bi can\b/g, '')
    .replace(/\bi will\b/g, '')
    .replace(/\bto trade\b/g, '')
    .replace(/\btrade\b/g, '')
    .replace(/\boffer\b/g, '')
    .replace(/\bgive me\b/g, '')
    .replace(/\brequest\b/g, '')
    .trim();
}

function detectFaction(
  message: string,
  selectedFactionId: FactionId,
  factionAliases: Record<string, FactionId>
): FactionId {
  for (const [alias, factionId] of Object.entries(factionAliases)) {
    if (message.includes(alias.replaceAll('_', ' ')) || message.includes(alias)) {
      return factionId;
    }
  }

  return selectedFactionId;
}

function detectTone(message: string): BargainingTone {
  if (/threat|destroy|or else|pay up|you will/i.test(message)) return 'threatening';
  if (/lie|trick|hide|secret/i.test(message)) return 'deceptive';
  if (/now|demand|must|take it/i.test(message)) return 'aggressive';
  if (/please|respect|fair|honor/i.test(message)) return 'polite';
  if (/desperate|starving|urgent|survive/i.test(message)) return 'desperate';
  return 'diplomatic';
}

function detectPoliticalStance(message: string): PoliticalStance {
  if (/independent|freedom|self-rule|frontier/i.test(message)) return 'pro_independence';
  if (/corporate|market|monopoly|shareholder/i.test(message)) return 'corporate';
  if (/humanitarian|survive|relief|medicine|civilians/i.test(message)) return 'humanitarian';
  if (/enemy|rival|against/i.test(message)) return 'anti_enemy';
  if (/your people|your faction|your union|your combine|your frontier/i.test(message)) return 'pro_faction';
  return 'neutral';
}

function detectPhilosophyAppeal(message: string): PhilosophyAppeal {
  if (/profit|market|margin|credits|monopoly/i.test(message)) return 'profit';
  if (/control|dominate|power|rule/i.test(message)) return 'domination';
  if (/freedom|independent|self-rule/i.test(message)) return 'freedom';
  if (/science|research|technology|data/i.test(message)) return 'science';
  if (/tradition|ancestor|heritage/i.test(message)) return 'tradition';
  if (/medicine|survive|relief|civilians|humanitarian/i.test(message)) return 'humanitarian';
  return 'cooperation';
}

function detectProposalFrame(message: string): StructuredBargainingIntent['proposalFrame'] {
  if (/good for you|favor of (your|the)|benefits you|your people gain|helps your|for your civilization|for your faction/i.test(message)) {
    return 'civilization_favor';
  }

  if (/good for me|i benefit|i need|help me|my profit|my ship/i.test(message)) {
    return 'player_favor';
  }

  if (/both|mutual|shared|together|fair|win-win|each other/i.test(message)) {
    return 'mutual';
  }

  return 'unclear';
}

function extractClaims(message: string): string[] {
  return message
    .split(/[.!?]/)
    .map((claim) => claim.trim())
    .filter((claim) => claim.length > 0 && /i have|my cargo|my stores|support|help|enemy|colony|colonies/i.test(claim));
}

function sanitizeBundle(bundle: unknown): ResourceBundle {
  const sanitized: ResourceBundle = {};

  if (!bundle || typeof bundle !== 'object') {
    return sanitized;
  }

  for (const [resourceId, amount] of Object.entries(bundle as Record<string, unknown>)) {
    if (resourceId in resources && Number(amount) > 0) {
      sanitized[resourceId as ResourceId] = Math.floor(Number(amount));
    }
  }

  return sanitized;
}

function resourceAliases(resourceId: ResourceId): string[] {
  const customAliases: Partial<Record<ResourceId, string[]>> = {
    credits: ['credits?', 'credit chips?', 'cr', 'cash', 'money'],
    medicine: ['medicine', 'meds?', 'medical supplies'],
    fuel_cells: ['fuel[ _-]cells?', 'fuel', 'cells?'],
    alien_relics: ['alien[ _-]relics?', 'relics?', 'artifacts?'],
    star_silk: ['star[ _-]silk', 'silk'],
  };
  const spaced = resourceId.replaceAll('_', '[ _-]');
  const singular = spaced.endsWith('s') ? spaced.slice(0, -1) : spaced;
  return [...(customAliases[resourceId] ?? []), spaced, singular];
}

function weightedBonus(weights: Record<string, number>, key: string, scale: number): number {
  return ((weights[key] ?? 1) - 1) * scale;
}

function calculateReputationDelta(
  structured: StructuredBargainingIntent,
  faction: Faction,
  liesDetected: string[],
  shortagesDetected: string[]
): { delta: number; reasons: string[] } {
  const rules = faction.reputationRules as Record<string, number>;
  const reasons: string[] = [];
  let delta = 0;

  if (structured.proposalFrame === 'civilization_favor') {
    delta += rules.acknowledgedCivilizationFavor ?? 0;
    reasons.push('player framed the bargain as favoring the civilization');
  } else if (structured.proposalFrame === 'player_favor') {
    delta += rules.selfServingDeal ?? 0;
    reasons.push('player framed the bargain as self-serving');
  } else if (structured.proposalFrame === 'mutual') {
    delta += Math.ceil((rules.acknowledgedCivilizationFavor ?? 0) / 2);
    reasons.push('player framed the bargain as mutual');
  }

  if ((faction.philosophy as Record<string, number>)[structured.philosophyAppeal] > 1) {
    delta += rules.alignedPolitics ?? 0;
    reasons.push(`${structured.philosophyAppeal} appeal aligns with ideology`);
  } else if ((faction.philosophy as Record<string, number>)[structured.philosophyAppeal] < 0.8) {
    delta += rules.misalignedPolitics ?? 0;
    reasons.push(`${structured.philosophyAppeal} appeal clashes with ideology`);
  }

  if (structured.tone === 'polite' || structured.tone === 'diplomatic') {
    delta += rules.respectfulTone ?? 0;
    reasons.push('respectful tone');
  }

  if (structured.tone === 'aggressive' || structured.tone === 'threatening') {
    delta += rules.hostileTone ?? 0;
    reasons.push('hostile tone');
  }

  if (shortagesDetected.length > 0) {
    delta += rules.impossibleAsk ?? 0;
    reasons.push('asked for stock the civilization cannot provide');
  }

  if (liesDetected.length > 0) {
    delta -= Math.max(6, faction.liePenalty);
    reasons.push('scanner caught a false player claim');
  }

  return {
    delta: clamp(Math.round(delta), -20, 20),
    reasons,
  };
}

function personalityPassFor(faction: Faction): string {
  const passes = faction.personalityPasses as Record<string, string>;

  if (faction.relationshipWithPlayer >= 45 || faction.trust >= 65) {
    return passes.trusted ?? faction.personality;
  }

  if (faction.relationshipWithPlayer < -10 || faction.trust < 25) {
    return passes.distrusted ?? faction.personality;
  }

  return passes.neutral ?? faction.personality;
}

function emptyResult(reason: NegotiationResult['reason']): NegotiationResult {
  return {
    outcome: 'reject',
    reason,
    score: -999,
    offeredValue: 0,
    requestedValue: 0,
  };
}

function isFactionId(value: unknown): value is FactionId {
  return value === 'vega_union' || value === 'eclipse_combine' || value === 'nova_frontier';
}

function isTone(value: unknown): value is BargainingTone {
  return (
    value === 'polite' ||
    value === 'diplomatic' ||
    value === 'aggressive' ||
    value === 'desperate' ||
    value === 'threatening' ||
    value === 'deceptive'
  );
}

function isPoliticalStance(value: unknown): value is PoliticalStance {
  return (
    value === 'pro_faction' ||
    value === 'anti_enemy' ||
    value === 'neutral' ||
    value === 'pro_independence' ||
    value === 'corporate' ||
    value === 'humanitarian'
  );
}

function isPhilosophyAppeal(value: unknown): value is PhilosophyAppeal {
  return (
    value === 'cooperation' ||
    value === 'humanitarian' ||
    value === 'profit' ||
    value === 'domination' ||
    value === 'freedom' ||
    value === 'science' ||
    value === 'tradition'
  );
}

function isProposalFrame(value: unknown): value is StructuredBargainingIntent['proposalFrame'] {
  return value === 'civilization_favor' || value === 'player_favor' || value === 'mutual' || value === 'unclear';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
