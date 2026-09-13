import { fr, type MessageKey } from './dictionary';
import { isMessageKey } from './core';
// Exact known messages only: never echo provider details or unknown technical errors.
const aliases: Record<string, MessageKey> = {
  "Cette session de paiement ne vous appartient pas": "api.ownership",
  "Cette offre n’est plus disponible. Votre paiement a été remboursé automatiquement.": "api.soldOutRefunded",
  "Cette offre n’est plus disponible. Votre remboursement a ete effectue et verifie par FoodSave.": "api.soldOutManual",
  "Cette offre n’est plus disponible. Votre remboursement est en cours de traitement ou de verification par FoodSave.": "api.soldOutPending",
  "Commande annulee et remboursement reussi.": "api.cancelSuccess",
  "Commande annulee et remboursement reussi. Le stock doit etre verifie par FoodSave.": "api.cancelStock",
  "Annulation acceptee. Le remboursement est incomplet et en cours de traitement.": "api.cancelPending",
  "Annulation acceptee. Le remboursement necessite une investigation.": "api.cancelReview",
  "Annulation acceptee. Le resultat du remboursement est incertain et doit etre verifie.": "api.cancelUnknown",
  "Commande annulee et client rembourse avec succes": "api.merchantCancelled",
  "Le remboursement a reussi, mais le stock doit etre verifie par FoodSave.": "api.refundStock",
  "Champs manquants": "api.missingFields",
  "Cet email est deja utilise": "api.emailUsed",
  "Email ou mot de passe incorrect": "api.credentials",
  "Ce compte a deja un commerce": "api.businessExists",
  "Adresse introuvable. Verifiez l'adresse, la ville, la province et le code postal.": "api.businessAddress",
  "Cette offre n'est plus disponible": "api.unavailable",
  "La fenetre de recuperation de cette offre est terminee": "api.expired",
  "Ce commerce n'a pas encore configure ses paiements": "api.paymentSetup",
  "Paiement non confirme": "api.paymentUnconfirmed",
  "Commande introuvable": "api.orderMissing",
  "Cette commande est deja annulee": "api.orderCancelled",
  "Une commande deja recuperee ne peut pas etre annulee": "api.orderPickedUp",
  "Cette commande ne peut pas etre annulee": "api.notCancellable",
  "Le delai d'annulation est depasse. L'annulation doit etre faite au moins 60 minutes avant la recuperation.": "api.cutoff",
  "Paiement Stripe introuvable": "api.paymentMissing",
  "Veuillez choisir ou saisir un motif d annulation valide": "api.reason",
  "Cette commande a deja ete traitee": "api.processed",
  "Cette commande n'appartient pas a votre commerce": "api.pickupOwner",
  "Cette commande a deja ete recuperee": "api.pickedUp",
  "Commande validee avec succes": "api.validated"
};
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’]/g, "'").trim().replace(/[.!]$/, '').toLowerCase();
const known = new Map<string, MessageKey>([
 ...Object.entries(fr).map(([key,value]) => [normalize(value), key as MessageKey] as const),
 ...Object.entries(aliases).map(([value,key]) => [normalize(value),key] as const),
]);
export function safeMessageKey(value: unknown): MessageKey {
 if (isMessageKey(value)) return value;
 return typeof value === 'string' ? known.get(normalize(value)) || 'common.error' : 'common.error';
}

// Match only fixed server templates. Captured titles/reasons remain verbatim.
export function notificationMessage(value: string): { key: MessageKey; values?: Record<string,string> } {
 const patterns: [RegExp, MessageKey][] = [
  [/^Votre reservation pour (.+) est confirmee$/, 'notification.confirmed'],
  [/^Nouvelle commande recue pour (.+)$/, 'notification.order'],
  [/^Votre commande (.+) a ete annulee et remboursee$/, 'notification.cancelled'],
  [/^Votre commande (.+) a ete recuperee avec succes$/, 'notification.pickup'],
  [/^Nouvelle offre pres de chez vous : (.+)$/, 'notification.offer'],
 ];
 for (const [pattern,key] of patterns) { const match=value.match(pattern); if(match) return {key,values:{title:match[1]}}; }
 const cancelled=value.match(/^Le commerce a annule votre commande (.+)\. Motif : (.+)\. Votre paiement a ete rembourse\.$/);
 if(cancelled) return {key:'notification.merchantCancelled',values:{title:cancelled[1],reason:cancelled[2]}};
 if (['Votre filleul a complete sa premiere commande, vous avez recu une recompense','Merci d avoir utilise un code de parrainage, vous avez recu une recompense'].includes(value)) return {key:'notification.reward'};
 return {key:'notification.fallback'};
}
