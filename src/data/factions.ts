import type { Faction, FactionId, FactionStance } from '../types';

export const factions: Record<FactionId, Faction> = {
  vega_exchange: {
    id: 'vega_exchange',
    name: 'Vega Exchange Authority',
    identity: 'Banking blocs, licensed brokers, and dock registrars.',
    home: 'Vega Station',
  },
  sirius_guild: {
    id: 'sirius_guild',
    name: 'Sirius Mining Guild',
    identity: 'Ore barons, refinery supervisors, and extraction crews.',
    home: 'Sirius Outpost',
  },
  nova_relief: {
    id: 'nova_relief',
    name: 'Nova Relief Collective',
    identity: 'Supply stewards, medics, and colony quartermasters.',
    home: 'Nova-7 Colony',
  },
  free_caravans: {
    id: 'free_caravans',
    name: 'Free Caravans Syndicate',
    identity: 'Luxury haulers, route fixers, and roaming trade families.',
    home: 'Deep convoy routes',
  },
  dust_runners: {
    id: 'dust_runners',
    name: 'Dust Runner Clans',
    identity: 'Scrappers, smugglers, and dangerous edge-route captains.',
    home: 'Unregistered frontier docks',
  },
};

export const factionLinks: Record<FactionId, Partial<Record<FactionId, FactionStance>>> = {
  vega_exchange: {
    sirius_guild: 'friendly',
    nova_relief: 'ally',
    free_caravans: 'friendly',
    dust_runners: 'rival',
  },
  sirius_guild: {
    vega_exchange: 'friendly',
    nova_relief: 'rival',
    free_caravans: 'neutral',
    dust_runners: 'hostile',
  },
  nova_relief: {
    vega_exchange: 'ally',
    sirius_guild: 'rival',
    free_caravans: 'friendly',
    dust_runners: 'hostile',
  },
  free_caravans: {
    vega_exchange: 'friendly',
    sirius_guild: 'neutral',
    nova_relief: 'friendly',
    dust_runners: 'rival',
  },
  dust_runners: {
    vega_exchange: 'rival',
    sirius_guild: 'hostile',
    nova_relief: 'hostile',
    free_caravans: 'rival',
  },
};

export const factionIds = Object.keys(factions) as FactionId[];
