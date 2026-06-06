import territories from '../data/territories.json';
import { calculateResourceValue, getFaction } from './negotiation';
import type { FactionId, ResourceBundle, ResourceId } from './negotiation';

export type TerritoryId = keyof typeof territories;

export type TerritoryPurchaseOffer = {
  territoryId: TerritoryId;
  seller: FactionId;
  sellerRelationship?: number;
  offered: ResourceBundle;
};

export type TerritoryPurchaseResult = {
  outcome: 'accept' | 'reject' | 'lease_offer';
  requiredValue: number;
  offeredValue: number;
  reason: 'fair' | 'not_for_sale' | 'low_value';
};

export function evaluateTerritoryPurchase(offer: TerritoryPurchaseOffer): TerritoryPurchaseResult {
  const territory = territories[offer.territoryId];
  const seller = {
    ...getFaction(offer.seller),
    relationship: offer.sellerRelationship ?? 0,
  };
  const offeredValue = Object.entries(offer.offered).reduce((total, [resourceId, amount]) => {
    return total + calculateResourceValue(resourceId as ResourceId, amount ?? 0, seller);
  }, 0);

  let requiredValue = territory.basePrice + territory.strategicValue;

  if (!territory.isForSale) {
    return {
      outcome: 'reject',
      reason: 'not_for_sale',
      requiredValue,
      offeredValue,
    };
  }

  if (seller.relationship < 0) {
    requiredValue *= 1.25;
  }

  if (seller.wealth > 1000) {
    requiredValue *= 1.2;
  }

  if (offeredValue >= requiredValue * 1.1) {
    return {
      outcome: 'accept',
      reason: 'fair',
      requiredValue,
      offeredValue,
    };
  }

  if (offeredValue >= requiredValue * 0.75 && territory.leaseAllowed) {
    return {
      outcome: 'lease_offer',
      reason: 'low_value',
      requiredValue,
      offeredValue,
    };
  }

  return {
    outcome: 'reject',
    reason: 'low_value',
    requiredValue,
    offeredValue,
  };
}
