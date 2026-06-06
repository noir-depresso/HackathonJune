import type { NegotiationResult } from './negotiation';

export type RelationshipStats = {
  relationship: number;
  trust: number;
};

export function relationshipDeltaAfterTrade(result: NegotiationResult): RelationshipStats {
  if (result.outcome === 'accept') {
    return {
      relationship: 2,
      trust: 1,
    };
  }

  if (result.reason === 'taboo') {
    return {
      relationship: -5,
      trust: -3,
    };
  }

  if (result.reason === 'lie_detected') {
    return {
      relationship: -7,
      trust: -8,
    };
  }

  if (result.reason === 'overly_good_suspicious') {
    return {
      relationship: -2,
      trust: -4,
    };
  }

  if (result.outcome === 'reject') {
    return {
      relationship: -1,
      trust: 0,
    };
  }

  return {
    relationship: 0,
    trust: 0,
  };
}
