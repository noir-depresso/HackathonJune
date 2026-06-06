import { factionIds } from '../data/factions';
import { goods } from '../data/items';
import type { FactionId, GameState, GoodId, PendingEvent } from '../types';
import {
  adjustRelationship,
  appendLog,
  checkGameOver,
  consumeSupplies,
  factionName,
  gainCargo,
  gainSupply,
  incomePerTurn,
  loseCredits,
  loseSupply,
  vendorsAtLocation,
} from './gameState';
import { itemName } from './stockMarket';
import { applyStockMarketTurn, influenceFactionStocks } from './stockMarket';

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomFaction(exclude: FactionId[] = []): FactionId {
  return randomPick(factionIds.filter((factionId) => !exclude.includes(factionId)));
}

function randomFactionPair(): [FactionId, FactionId] {
  const first = randomFaction();
  const second = randomFaction([first]);
  return [first, second];
}

function createBorderWarEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - CONVOY WAR',
    description: `${factionName(first)} and ${factionName(second)} have armed freighters firing across a trade corridor. Your ship is asked to pick a side or stay out.`,
    options: [
      {
        command: `support ${first}`,
        label: `Support ${factionName(first)}`,
        effect: (state) => {
          const fee = loseCredits(state, 90);
          adjustRelationship(state, first, 14);
          adjustRelationship(state, second, -12);
          influenceFactionStocks(state, first, 0.01);
          influenceFactionStocks(state, second, -0.008);
          appendLog(
            state,
            `You funnel ${fee} credits in emergency cargo support to ${factionName(first)}.\nTheir standing rises, and ${factionName(second)} marks you as an enemy broker.`
          );
        },
      },
      {
        command: `support ${second}`,
        label: `Support ${factionName(second)}`,
        effect: (state) => {
          const fee = loseCredits(state, 90);
          adjustRelationship(state, second, 14);
          adjustRelationship(state, first, -12);
          influenceFactionStocks(state, second, 0.01);
          influenceFactionStocks(state, first, -0.008);
          appendLog(
            state,
            `You funnel ${fee} credits in emergency cargo support to ${factionName(second)}.\nTheir standing rises, and ${factionName(first)} marks you as an enemy broker.`
          );
        },
      },
      {
        command: 'support none',
        label: 'Remain Neutral',
        effect: (state) => {
          adjustRelationship(state, first, -2);
          adjustRelationship(state, second, -2);
          influenceFactionStocks(state, first, -0.002);
          influenceFactionStocks(state, second, -0.002);
          appendLog(state, 'You refuse to enter the convoy war.\nBoth sides call you cautious and unreliable under fire.');
        },
      },
    ],
  };
}

function createTariffHearingEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - TARIFF HEARING',
    description: `${factionName(first)} accuses ${factionName(second)} of predatory tariffs. A trade witness is needed.`,
    options: [
      {
        command: `endorse ${first}`,
        label: `Endorse ${factionName(first)}`,
        effect: (state) => {
          gainSupply(state, 'food', 2);
          adjustRelationship(state, first, 12);
          adjustRelationship(state, second, -10);
          influenceFactionStocks(state, first, 0.008);
          influenceFactionStocks(state, second, -0.007);
          appendLog(
            state,
            `You testify in favor of ${factionName(first)}.\nThey reward you with fresh provisions, while ${factionName(second)} feels publicly betrayed.`
          );
        },
      },
      {
        command: `endorse ${second}`,
        label: `Endorse ${factionName(second)}`,
        effect: (state) => {
          state.player.credits += 80;
          adjustRelationship(state, second, 12);
          adjustRelationship(state, first, -10);
          influenceFactionStocks(state, second, 0.008);
          influenceFactionStocks(state, first, -0.007);
          appendLog(
            state,
            `You endorse ${factionName(second)} in the tariff hearing.\nTheir merchants pay you for the favor, and ${factionName(first)} turns cold.`
          );
        },
      },
      {
        command: 'endorse none',
        label: 'Decline Involvement',
        effect: (state) => {
          adjustRelationship(state, first, 1);
          adjustRelationship(state, second, 1);
          appendLog(
            state,
            'You decline to testify and offer quiet mediation instead.\nNo one gains much, but both factions respect your restraint.'
          );
        },
      },
    ],
  };
}

function createRefugeeCorridorEvent(): PendingEvent {
  const [first, second] = randomFactionPair();

  return {
    title: 'NEUTRAL EVENT - REFUGEE CORRIDOR',
    description: `Refugee ships are trapped between patrol zones claimed by ${factionName(first)} and ${factionName(second)}. Your freighter can escort one side's rescue effort.`,
    options: [
      {
        command: `aid ${first}`,
        label: `Aid ${factionName(first)}`,
        effect: (state) => {
          loseSupply(state, 'fuel', 6);
          adjustRelationship(state, first, 16);
          adjustRelationship(state, second, -6);
          influenceFactionStocks(state, first, 0.012);
          influenceFactionStocks(state, second, -0.004);
          appendLog(
            state,
            `You burn 6 fuel escorting relief craft aligned with ${factionName(first)}.\nThey remember the help, while ${factionName(second)} resents being passed over.`
          );
        },
      },
      {
        command: `aid ${second}`,
        label: `Aid ${factionName(second)}`,
        effect: (state) => {
          loseSupply(state, 'fuel', 6);
          adjustRelationship(state, second, 16);
          adjustRelationship(state, first, -6);
          influenceFactionStocks(state, second, 0.012);
          influenceFactionStocks(state, first, -0.004);
          appendLog(
            state,
            `You burn 6 fuel escorting relief craft aligned with ${factionName(second)}.\nThey remember the help, while ${factionName(first)} resents being passed over.`
          );
        },
      },
      {
        command: 'aid none',
        label: 'Stay Clear',
        effect: (state) => {
          loseCredits(state, 40);
          adjustRelationship(state, first, -5);
          adjustRelationship(state, second, -5);
          influenceFactionStocks(state, first, -0.004);
          influenceFactionStocks(state, second, -0.004);
          appendLog(
            state,
            'You decline corridor duty and only broadcast a warning relay.\nThe stranded civilians survive without your help, and both factions judge you harshly.'
          );
        },
      },
    ],
  };
}

function runGoodEvent(state: GameState): void {
  const goodEvents = [
    () => {
      const factionId = randomFaction();
      state.player.credits += 180;
      adjustRelationship(state, factionId, 8);
      influenceFactionStocks(state, factionId, 0.006);
      appendLog(
        state,
        `GOOD EVENT - SALVAGE BEACON\nYou recover a legal salvage cache and turn it in cleanly.\nCredits +180, and ${factionName(factionId)} notes your honesty.`
      );
    },
    () => {
      gainSupply(state, 'food', 3);
      gainSupply(state, 'water', 3);
      gainSupply(state, 'fuel', 8);
      appendLog(state, 'GOOD EVENT - RELIEF CONVOY\nA passing convoy tops up your essentials.\nFood +3, water +3, fuel +8.');
    },
    () => {
      const goodId = randomPick(Object.keys(goods) as GoodId[]);
      gainCargo(state, goodId, 2);
      state.player.credits += 70;
      appendLog(
        state,
        `GOOD EVENT - FESTIVAL CHARTER\nYou land a ceremonial hauling contract.\nCredits +70 and ${goods[goodId].name} +2.`
      );
    },
  ];

  randomPick(goodEvents)();
}

function runBadEvent(state: GameState): void {
  const badEvents = [
    () => {
      const foodLost = loseSupply(state, 'food', 2);
      const waterLost = loseSupply(state, 'water', 3);
      appendLog(state, `BAD EVENT - HULL BREACH\nA seal failure spoils your stores.\nFood -${foodLost}, water -${waterLost}.`);
    },
    () => {
      const creditsLost = loseCredits(state, 160);
      appendLog(state, `BAD EVENT - PIRATE TOLL\nAn outlaw checkpoint strips value from your hold.\nCredits -${creditsLost}.`);
    },
    () => {
      const fuelLost = loseSupply(state, 'fuel', 10);
      const factionId = randomFaction();
      adjustRelationship(state, factionId, -8);
      influenceFactionStocks(state, factionId, -0.006);
      appendLog(
        state,
        `BAD EVENT - MISSED DELIVERY\nA fuel manifold fracture costs ${fuelLost} fuel.\nYour delay also angers ${factionName(factionId)}.`
      );
    },
  ];

  randomPick(badEvents)();
}

function prepareNeutralEvent(state: GameState): void {
  const neutralEvents = [createBorderWarEvent, createTariffHearingEvent, createRefugeeCorridorEvent];
  state.pendingEvent = randomPick(neutralEvents)();

  appendLog(
    state,
    `${state.pendingEvent.title}\n${state.pendingEvent.description}\nChoices:\n${state.pendingEvent.options
      .map((option) => `- ${option.label} [${option.command}]`)
      .join('\n')}`
  );
}

export function maybeTriggerRandomEvent(state: GameState): void {
  if (state.gameOver) return;

  state.pendingEvent = null;

  if (Math.random() >= 0.5) {
    appendLog(state, 'ROUND EVENT\nThe shipping lanes stay quiet this round.');
    return;
  }

  const eventType = randomPick(['good', 'bad', 'neutral'] as const);

  if (eventType === 'good') {
    runGoodEvent(state);
  } else if (eventType === 'bad') {
    runBadEvent(state);
  } else {
    prepareNeutralEvent(state);
  }

  checkGameOver(state);
}

export function maybeRollSpecialOffer(state: GameState): void {
  state.activeSpecial = null;

  if (Math.random() >= 0.1) {
    return;
  }

  const vendor = randomPick(vendorsAtLocation(state));
  const offer = randomPick(vendor.stock);
  const type = offer.kind === 'supply' ? 'discount' : randomPick(['discount', 'buyback'] as const);

  state.activeSpecial = {
    vendorId: vendor.id,
    itemId: offer.itemId,
    type,
    description:
      type === 'discount'
        ? `${vendor.name} posts a flash sale on ${itemName(offer.itemId)}.`
        : `${vendor.name} announces high-demand buyback rates for ${itemName(offer.itemId)}.`,
  };

  appendLog(state, `SPECIAL OFFER\n${state.activeSpecial.description}`);
}

export function advanceTurn(state: GameState, summary: string): void {
  if (state.gameOver) return;

  state.player.day += 1;
  const income = incomePerTurn(state);
  state.player.credits += income;
  consumeSupplies(state);

  appendLog(state, `${summary}\nTurn income: ${income} credits.\nSupplies consumed: food -2, water -2, fuel -1.`);

  maybeTriggerRandomEvent(state);
  maybeRollSpecialOffer(state);
  applyStockMarketTurn(state);
  checkGameOver(state);
}

export function resolvePendingEvent(state: GameState, command: string): boolean {
  if (!state.pendingEvent) return false;

  const option = state.pendingEvent.options.find((choice) => choice.command === command);

  if (!option) {
    appendLog(state, 'This event requires one of the listed choices before normal operations can resume.');
    return true;
  }

  option.effect(state);
  state.pendingEvent = null;
  checkGameOver(state);
  return true;
}
