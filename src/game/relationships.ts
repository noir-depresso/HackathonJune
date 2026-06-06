import type { NegotiationResult } from './negotiation';

export type RelationshipStats = {
  relationshipWithPlayer: number;
  trust: number;
};

export function relationshipDeltaAfterTrade(result: NegotiationResult): RelationshipStats {
  if (result.outcome === 'accept') {
    return {
      relationshipWithPlayer: 2,
      trust: 1,
    };
  }

  if (result.reason === 'taboo') {
    return {
      relationshipWithPlayer: -5,
      trust: -3,
    };
  }

  if (result.reason === 'lie_detected') {
    return {
      relationshipWithPlayer: -7,
      trust: -8,
    };
  }

  if (result.reason === 'overly_good_suspicious') {
    return {
      relationshipWithPlayer: -2,
      trust: -4,
    };
  }

  if (result.outcome === 'reject') {
    return {
      relationshipWithPlayer: -1,
      trust: 0,
    };
  }

  return {
    relationshipWithPlayer: 0,
    trust: 0,
  };
}
