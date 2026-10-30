import { processSallyMessage } from './sally-scenario-parser.mjs';
import { sanitizeScenarioUpdates } from './sally-text-core.mjs';

// Conservative single-fact intake grammar. Ambiguous, conditional, multi-fact,
// negated or unsupported messages produce no update and need clarification.
// The model, request history and caller localResult never supply evidence.
export function currentMessageEvidence(message) {
  const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/[.!]$/, '').toLowerCase();
  const rules = [
    ['zipCode', /^(?:(?:my|the) )?(?:zip(?: code)?)(?: is|:)?\s+(\d{5})$/, (v) => `ZIP ${v}`],
    ['zipCode', /^(?:mi |el )?codigo postal(?: es|:)?\s+(\d{5})$/, (v) => `ZIP ${v}`],
    ['purchasePrice', /^(?:(?:my|the) )?(?:purchase price|home price|price)(?: is|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `purchase price $${v}`],
    ['purchasePrice', /^(?:el |mi )?precio(?: de compra)?(?: es|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `purchase price $${v}`],
    ['downPayment', /^(?:(?:my|the) )?down payment(?: is|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `down payment $${v}`],
    ['downPayment', /^(?:mi |el )?pago inicial(?: es|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `down payment $${v}`],
    ['loanAmount', /^(?:(?:my|the) )?loan amount(?: is|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `loan amount $${v}`],
    ['loanAmount', /^(?:el |mi )?monto del prestamo(?: es|:)?\s+\$([\d,]+(?:\.\d+)?(?:k|m)?)$/, (v) => `loan amount $${v}`],
    ['creditScore', /^(?:my )?(?:credit score|fico)(?: is|:)?\s+(\d{3})$/, (v) => `credit score ${v}`],
    ['creditScore', /^(?:mi )?puntaje de credito(?: es|:)?\s+(\d{3})$/, (v) => `credit score ${v}`],
    ['occupancy', /^(?:this is|it is|this will be|my occupancy is|occupancy is) (?:my |a |an )?(primary home|second home|investment property)$/, (v) => v],
    ['occupancy', /^(?:es mi|sera mi|la ocupacion es) (vivienda principal|segunda vivienda|propiedad de inversion)$/, (v) => ({ 'vivienda principal': 'primary home', 'segunda vivienda': 'second home', 'propiedad de inversion': 'investment property' })[v]],
    ['loanPurpose', /^(i want to buy a home|i want to refinance|i want to take cash out)$/, (v) => v],
    ['loanPurpose', /^(quiero comprar una casa|quiero refinanciar|quiero retirar efectivo)$/, (v) => ({ 'quiero comprar una casa': 'buy', 'quiero refinanciar': 'refinance', 'quiero retirar efectivo': 'cash out' })[v]],
  ];
  const blank = Object.fromEntries(['loanPurpose', 'purchasePrice', 'downPayment', 'downPaymentPercent', 'loanAmount', 'creditScore', 'loanType', 'occupancy', 'zipCode'].map((key) => [key, '']));
  for (const [key, pattern, canonical] of rules) {
    const match = text.match(pattern);
    if (!match) continue;
    const parsed = sanitizeScenarioUpdates(processSallyMessage(canonical(match[1]), blank).scenario);
    return parsed[key] === undefined ? {} : { [key]: parsed[key] };
  }
  return {};
}

export function proposalMatchesEvidence(proposal, evidence) {
  if (proposal === undefined) return true;
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return false;
  return Object.entries(proposal).filter(([, value]) => value !== '' && value != null).every(([key, value]) => Object.hasOwn(evidence, key)
    && String(evidence[key]) === String(value));
}
