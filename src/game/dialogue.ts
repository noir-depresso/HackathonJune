import dialogueTemplates from '../data/dialogueTemplates.json';
import resources from '../data/resources.json';
import type { NegotiationResult, ResourceBundle, ResourceId } from './negotiation';

type DialogueOutcome = keyof typeof dialogueTemplates;

export function generateDialogue(result: NegotiationResult, factionName: string): string {
  const templateKey = getTemplateKey(result);
  const template = pickTemplate(templateKey);

  return template
    .replace('{faction}', factionName)
    .replace('{counteroffer}', formatCounteroffer(result.counteroffer?.offered, result.counteroffer?.requested))
    .replace('{resource}', formatResourceName(result.reasonResource));
}

export function formatBundle(bundle: ResourceBundle | undefined): string {
  if (!bundle || Object.keys(bundle).length === 0) {
    return 'nothing';
  }

  return Object.entries(bundle)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resourceId, amount]) => `${amount} ${formatResourceName(resourceId as ResourceId)}`)
    .join(', ');
}

function getTemplateKey(result: NegotiationResult): DialogueOutcome {
  if (result.reason === 'taboo') {
    return 'taboo';
  }

  if (result.reason === 'shortage') {
    return 'shortage';
  }

  return result.outcome;
}

function pickTemplate(key: DialogueOutcome): string {
  const templates = dialogueTemplates[key];
  return templates[Math.floor(Math.random() * templates.length)];
}

function formatCounteroffer(offered: ResourceBundle | undefined, requested: ResourceBundle | undefined): string {
  return `${formatBundle(offered)} for ${formatBundle(requested)}`;
}

export function formatResourceName(resourceId: ResourceId | undefined): string {
  if (!resourceId) {
    return 'that resource';
  }

  return resources[resourceId]?.name ?? resourceId;
}
