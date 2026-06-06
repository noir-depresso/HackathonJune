import type { ResourceBundle, ResourceId } from './negotiation';

export type Inventory = Partial<Record<ResourceId, number>>;

export type TradeResult = {
  success: boolean;
  message: string;
};

export function applyTradeToInventories(
  playerInventory: Inventory,
  factionInventory: Inventory,
  offered: ResourceBundle,
  requested: ResourceBundle
): TradeResult {
  if (!hasEnoughResources(playerInventory, offered)) {
    return {
      success: false,
      message: 'You do not have enough resources.',
    };
  }

  if (!hasEnoughResources(factionInventory, requested)) {
    return {
      success: false,
      message: 'The faction does not have enough resources.',
    };
  }

  subtractResources(playerInventory, offered);
  addResources(factionInventory, offered);
  subtractResources(factionInventory, requested);
  addResources(playerInventory, requested);

  return {
    success: true,
    message: 'Trade completed.',
  };
}

export function hasEnoughResources(inventory: Inventory, bundle: ResourceBundle): boolean {
  return Object.entries(bundle).every(([resourceId, amount]) => {
    return (inventory[resourceId as ResourceId] ?? 0) >= (amount ?? 0);
  });
}

function subtractResources(inventory: Inventory, bundle: ResourceBundle): void {
  for (const [resourceId, amount] of Object.entries(bundle)) {
    const id = resourceId as ResourceId;
    inventory[id] = (inventory[id] ?? 0) - (amount ?? 0);

    if ((inventory[id] ?? 0) <= 0) {
      delete inventory[id];
    }
  }
}

function addResources(inventory: Inventory, bundle: ResourceBundle): void {
  for (const [resourceId, amount] of Object.entries(bundle)) {
    const id = resourceId as ResourceId;
    inventory[id] = (inventory[id] ?? 0) + (amount ?? 0);
  }
}
