import type { NegotiationResult } from './negotiation';

export type RelationshipStats = {
  relationshipWithPlayer: number;
  trust: number;
};

export function relationshipDeltaAfterTrade(result: NegotiationResult): RelationshipStats {
  if (result.outcome === 'accept') {
    const generosityDelta = result.negotiator?.reputationDelta ?? 0;

    return {
      relationshipWithPlayer: 2 + generosityDelta,
      trust: 1 + Math.ceil(generosityDelta / 2),
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
