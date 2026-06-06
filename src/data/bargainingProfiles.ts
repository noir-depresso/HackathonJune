import type { BargainingInventory, BargainingResourceId, FactionId } from '../types';

type WeightedPreferences = Record<string, number>;

export type BargainingProfile = {
  ideology: string;
  personality: string;
  voiceStyle: string;
  personalityPasses: {
    trusted: string;
    neutral: string;
    distrusted: string;
  };
  wealth: number;
  likes: BargainingResourceId[];
  dislikes: BargainingResourceId[];
  urgentNeeds: BargainingResourceId[];
  tabooResources: BargainingResourceId[];
  bargainingStyle: string;
  philosophy: WeightedPreferences;
  politicalStances: WeightedPreferences;
  tonePreferences: WeightedPreferences;
  liePenalty: number;
  reputationRules: {
    acknowledgedCivilizationFavor: number;
    alignedPolitics: number;
    misalignedPolitics: number;
    respectfulTone: number;
    hostileTone: number;
    impossibleAsk: number;
    selfServingDeal: number;
  };
  overlyGoodDealPolicy: 'accept' | 'cautious' | 'decline';
  overlyGoodDealMultiplier: number;
  riskTolerance: number;
  greed: number;
  startingTrust: number;
  startingInventory: BargainingInventory;
};

export const bargainingProfiles: Record<FactionId, BargainingProfile> = {
  vega_exchange: {
    ideology: 'regulated trade, stable credit, and licensed port order',
    personality: 'diplomatic',
    voiceStyle: 'formal_merchant',
    personalityPasses: {
      trusted: 'warm, exacting, contract-minded, quietly generous',
      neutral: 'civil, procedural, focused on mutual solvency',
      distrusted: 'polite but guarded, audits every promise',
    },
    wealth: 1300,
    likes: ['credits', 'medicine', 'water'],
    dislikes: ['alien_relics'],
    urgentNeeds: ['fuel', 'medicine'],
    tabooResources: [],
    bargainingStyle: 'fair',
    philosophy: {
      cooperation: 1.2,
      humanitarian: 1.05,
      freedom: 0.9,
      profit: 1.25,
      domination: 0.65,
      science: 1,
      tradition: 1,
    },
    politicalStances: {
      pro_faction: 1.2,
      anti_enemy: 1.05,
      neutral: 1,
      pro_independence: 0.85,
      corporate: 1.2,
      humanitarian: 1.05,
    },
    tonePreferences: {
      diplomatic: 1.25,
      polite: 1.15,
      desperate: 0.9,
      aggressive: 0.7,
      threatening: 0.35,
      deceptive: 0.35,
    },
    liePenalty: 18,
    reputationRules: {
      acknowledgedCivilizationFavor: 3,
      alignedPolitics: 3,
      misalignedPolitics: -3,
      respectfulTone: 2,
      hostileTone: -5,
      impossibleAsk: -2,
      selfServingDeal: -1,
    },
    overlyGoodDealPolicy: 'cautious',
    overlyGoodDealMultiplier: 2.9,
    riskTolerance: 0.8,
    greed: 0.95,
    startingTrust: 58,
    startingInventory: {
      credits: 1100,
      food: 45,
      water: 70,
      fuel: 90,
      medicine: 14,
      ore: 20,
      star_silk: 4,
      alien_relics: 1,
    },
  },
  sirius_guild: {
    ideology: 'industrial extraction, refinery discipline, and hard-margin mining contracts',
    personality: 'blunt',
    voiceStyle: 'industrial',
    personalityPasses: {
      trusted: 'direct, practical, respectful of proven haulers',
      neutral: 'brusque, numbers-first, impatient with theater',
      distrusted: 'hard-edged, suspicious, ready to walk away',
    },
    wealth: 900,
    likes: ['credits', 'ore', 'fuel'],
    dislikes: ['star_silk'],
    urgentNeeds: ['food', 'fuel'],
    tabooResources: [],
    bargainingStyle: 'production_driven',
    philosophy: {
      cooperation: 0.95,
      humanitarian: 0.75,
      freedom: 0.8,
      profit: 1.25,
      domination: 1,
      science: 1.05,
      tradition: 1.05,
    },
    politicalStances: {
      pro_faction: 1.2,
      anti_enemy: 1.1,
      neutral: 1,
      pro_independence: 0.75,
      corporate: 1.15,
      humanitarian: 0.75,
    },
    tonePreferences: {
      diplomatic: 1,
      polite: 1,
      desperate: 0.95,
      aggressive: 0.95,
      threatening: 0.55,
      deceptive: 0.4,
    },
    liePenalty: 15,
    reputationRules: {
      acknowledgedCivilizationFavor: 2,
      alignedPolitics: 3,
      misalignedPolitics: -4,
      respectfulTone: 1,
      hostileTone: -4,
      impossibleAsk: -2,
      selfServingDeal: -1,
    },
    overlyGoodDealPolicy: 'accept',
    overlyGoodDealMultiplier: 3.4,
    riskTolerance: 1.05,
    greed: 1.15,
    startingTrust: 44,
    startingInventory: {
      credits: 820,
      food: 18,
      water: 25,
      fuel: 55,
      medicine: 6,
      ore: 180,
      star_silk: 2,
      alien_relics: 1,
    },
  },
  nova_relief: {
    ideology: 'frontier survival, medical triage, and colony protection',
    personality: 'protective',
    voiceStyle: 'active_kind',
    personalityPasses: {
      trusted: 'warm, urgent, protective, openly grateful',
      neutral: 'practical, compassionate, careful with scarce supplies',
      distrusted: 'stern, wounded, unwilling to reward exploitation',
    },
    wealth: 520,
    likes: ['food', 'water', 'medicine'],
    dislikes: ['alien_relics', 'star_silk'],
    urgentNeeds: ['food', 'water', 'medicine'],
    tabooResources: ['alien_relics'],
    bargainingStyle: 'need_driven',
    philosophy: {
      cooperation: 1.15,
      humanitarian: 1.35,
      freedom: 1.1,
      profit: 0.65,
      domination: 0.3,
      science: 1,
      tradition: 1,
    },
    politicalStances: {
      pro_faction: 1.15,
      anti_enemy: 0.9,
      neutral: 1,
      pro_independence: 1.15,
      corporate: 0.55,
      humanitarian: 1.35,
    },
    tonePreferences: {
      diplomatic: 1.15,
      polite: 1.2,
      desperate: 1.05,
      aggressive: 0.55,
      threatening: 0.25,
      deceptive: 0.25,
    },
    liePenalty: 24,
    reputationRules: {
      acknowledgedCivilizationFavor: 5,
      alignedPolitics: 5,
      misalignedPolitics: -6,
      respectfulTone: 3,
      hostileTone: -8,
      impossibleAsk: -3,
      selfServingDeal: -4,
    },
    overlyGoodDealPolicy: 'decline',
    overlyGoodDealMultiplier: 2.2,
    riskTolerance: 0.85,
    greed: 0.9,
    startingTrust: 52,
    startingInventory: {
      credits: 460,
      food: 12,
      water: 14,
      fuel: 24,
      medicine: 20,
      ore: 35,
      star_silk: 1,
      alien_relics: 0,
    },
  },
  free_caravans: {
    ideology: 'independent routes, reputation favors, and high-margin cargo freedom',
    personality: 'charming',
    voiceStyle: 'freewheeling',
    personalityPasses: {
      trusted: 'warm, playful, deal-hungry, loyal to good partners',
      neutral: 'witty, flexible, always watching the margin',
      distrusted: 'smiling but slippery, ready to price in betrayal',
    },
    wealth: 760,
    likes: ['credits', 'star_silk', 'alien_relics', 'fuel'],
    dislikes: ['ore'],
    urgentNeeds: ['fuel'],
    tabooResources: [],
    bargainingStyle: 'opportunistic',
    philosophy: {
      cooperation: 1,
      humanitarian: 0.85,
      freedom: 1.35,
      profit: 1.25,
      domination: 0.45,
      science: 0.95,
      tradition: 0.9,
    },
    politicalStances: {
      pro_faction: 1.1,
      anti_enemy: 0.95,
      neutral: 1,
      pro_independence: 1.3,
      corporate: 0.8,
      humanitarian: 0.85,
    },
    tonePreferences: {
      diplomatic: 1,
      polite: 1.05,
      desperate: 1,
      aggressive: 0.8,
      threatening: 0.35,
      deceptive: 0.75,
    },
    liePenalty: 12,
    reputationRules: {
      acknowledgedCivilizationFavor: 2,
      alignedPolitics: 4,
      misalignedPolitics: -3,
      respectfulTone: 1,
      hostileTone: -5,
      impossibleAsk: -2,
      selfServingDeal: -1,
    },
    overlyGoodDealPolicy: 'cautious',
    overlyGoodDealMultiplier: 2.6,
    riskTolerance: 1.2,
    greed: 1.08,
    startingTrust: 48,
    startingInventory: {
      credits: 720,
      food: 24,
      water: 22,
      fuel: 70,
      medicine: 8,
      ore: 40,
      star_silk: 18,
      alien_relics: 3,
    },
  },
  dust_runners: {
    ideology: 'frontier salvage, clan leverage, and survival outside licensed law',
    personality: 'dangerous',
    voiceStyle: 'rough',
    personalityPasses: {
      trusted: 'rough but loyal, amused by useful nerve',
      neutral: 'short, suspicious, hungry for leverage',
      distrusted: 'hostile, mocking, looking for weakness',
    },
    wealth: 430,
    likes: ['credits', 'fuel', 'ore', 'alien_relics'],
    dislikes: ['medicine'],
    urgentNeeds: ['fuel', 'food'],
    tabooResources: [],
    bargainingStyle: 'predatory',
    philosophy: {
      cooperation: 0.65,
      humanitarian: 0.45,
      freedom: 1.15,
      profit: 1.1,
      domination: 1.25,
      science: 0.8,
      tradition: 1.15,
    },
    politicalStances: {
      pro_faction: 1.15,
      anti_enemy: 1.2,
      neutral: 1,
      pro_independence: 1.05,
      corporate: 0.7,
      humanitarian: 0.5,
    },
    tonePreferences: {
      diplomatic: 0.85,
      polite: 0.85,
      desperate: 1.05,
      aggressive: 1.05,
      threatening: 0.8,
      deceptive: 0.9,
    },
    liePenalty: 9,
    reputationRules: {
      acknowledgedCivilizationFavor: 1,
      alignedPolitics: 3,
      misalignedPolitics: -3,
      respectfulTone: 0,
      hostileTone: -2,
      impossibleAsk: -1,
      selfServingDeal: -1,
    },
    overlyGoodDealPolicy: 'accept',
    overlyGoodDealMultiplier: 3.6,
    riskTolerance: 1.4,
    greed: 1.28,
    startingTrust: 28,
    startingInventory: {
      credits: 380,
      food: 16,
      water: 14,
      fuel: 62,
      medicine: 4,
      ore: 75,
      star_silk: 5,
      alien_relics: 7,
    },
  },
};
