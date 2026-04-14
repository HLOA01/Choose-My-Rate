import { classifyIntent, normalizeText } from './intentClassifier';

const STEP_ORDER = [
  'language',
  'loanType',
  'occupancy',
  'purchasePrice',
  'downPayment',
  'creditScore',
  'monthlyIncome',
  'zipCode',
  'area',
];

function toTitleCase(value = '') {
  return String(value)
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseMoney(value = '') {
  const raw = String(value)
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .trim();

  if (!raw) return '';

  const match = raw.match(/(\d+(\.\d+)?)(k)?/);
  if (!match) return '';

  const num = Number(match[1]);
  if (!Number.isFinite(num)) return '';

  return match[3] ? Math.round(num * 1000) : Math.round(num);
}

function parseIncome(value = '') {
  const text = normalizeText(value);
  const amount = parseMoney(text);

  if (amount === '') return '';

  if (
    text.includes('per year') ||
    text.includes('a year') ||
    text.includes('yearly') ||
    text.includes('annual') ||
    text.includes('annually')
  ) {
    return Math.round(amount / 12);
  }

  if (
    text.includes('biweekly') ||
    text.includes('bi-weekly') ||
    text.includes('every two weeks')
  ) {
    return Math.round((amount * 26) / 12);
  }

  if (
    text.includes('weekly') ||
    text.includes('per week') ||
    text.includes('a week')
  ) {
    return Math.round((amount * 52) / 12);
  }

  return amount;
}

function parseZip(value = '') {
  const match = String(value).match(/\b\d{5}\b/);
  return match ? match[0] : '';
}

function normalizeLanguage(value = '') {
  const text = normalizeText(value);

  if (
    text.includes('español') ||
    text.includes('spanish') ||
    text === 'es'
  ) {
    return 'Spanish';
  }

  if (
    text.includes('english') ||
    text === 'en'
  ) {
    return 'English';
  }

  return '';
}

function normalizeLoanType(value = '') {
  const text = normalizeText(value);

  if (text.includes('fha')) return 'FHA';
  if (text.includes('conventional') || text.includes('conv')) return 'Conventional';
  if (text.includes('va')) return 'VA';
  if (text.includes('usda')) return 'USDA';

  return '';
}

function normalizePurpose(value = '') {
  const text = normalizeText(value);

  if (
    text.includes('purchase') ||
    text.includes('buy') ||
    text.includes('buying') ||
    text.includes('compra')
  ) {
    return 'Purchase';
  }

  if (
    text.includes('refi') ||
    text.includes('refinance') ||
    text.includes('refinancing')
  ) {
    return 'Refinance';
  }

  return '';
}

function normalizeOccupancy(value = '') {
  const text = normalizeText(value);

  if (
    text.includes('primary') ||
    text.includes('primary residence') ||
    text.includes('live in it') ||
    text.includes('living in it') ||
    text.includes('owner occupied')
  ) {
    return 'Primary Residence';
  }

  if (
    text.includes('second home') ||
    text.includes('vacation home') ||
    text.includes('second')
  ) {
    return 'Second Home';
  }

  if (
    text.includes('investment') ||
    text.includes('rental') ||
    text.includes('investor')
  ) {
    return 'Investment Property';
  }

  return '';
}

function normalizeTerm(value = '') {
  const text = normalizeText(value);

  if (text.includes('15')) return '15-Year Fixed';
  if (text.includes('20')) return '20-Year Fixed';
  if (text.includes('30')) return '30-Year Fixed';

  return '';
}

function normalizeCredit(value = '') {
  const text = String(value);
  const match = text.match(/\b([3-8]\d{2})\b/);
  if (!match) return '';
  const score = Number(match[1]);
  if (score < 300 || score > 850) return '';
  return String(score);
}

function parseDownPayment(message = '', purchasePrice = 0) {
  const text = normalizeText(message);

  if (!text) return null;

  const percentMatch = text.match(/(\d+(\.\d+)?)\s*%/);
  if (percentMatch) {
    const percent = Number(percentMatch[1]);
    if (!Number.isFinite(percent)) return null;

    const amount =
      purchasePrice > 0 ? Math.round((purchasePrice * percent) / 100) : '';

    return {
      downPaymentPercent: Number(percent.toFixed(2)),
      downPaymentAmount: amount,
    };
  }

  const mentionsDown =
    text.includes('down') ||
    text.includes('put down') ||
    text.includes('cash down') ||
    text.includes('down payment');

  if (mentionsDown || text.includes('$')) {
    const amount = parseMoney(text);
    if (amount !== '') {
      const percent =
        purchasePrice > 0 ? Number(((amount / purchasePrice) * 100).toFixed(2)) : '';

      return {
        downPaymentAmount: amount,
        downPaymentPercent: percent,
      };
    }
  }

  return null;
}

function parsePriceRange(message = '') {
  const text = normalizeText(message);
  const matches = Array.from(
    String(message).matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?/gi)
  );

  if (!matches.length) return '';

  const amounts = matches
    .map((match) => {
      const num = Number(String(match[1]).replace(/,/g, ''));
      if (!Number.isFinite(num)) return null;
      return match[2] ? Math.round(num * 1000) : Math.round(num);
    })
    .filter(Boolean);

  if (!amounts.length) return '';

  if (
    text.includes('price') ||
    text.includes('purchase') ||
    text.includes('looking at') ||
    text.includes('budget') ||
    text.includes('range')
  ) {
    return Math.max(...amounts);
  }

  return '';
}

function parseArea(message = '', currentStep = '') {
  const raw = String(message).trim();

  const countyMatch = raw.match(/([A-Za-z\s]+County)/i);
  if (countyMatch) return toTitleCase(countyMatch[1]);

  const cityMatch = raw.match(/([A-Za-z\s]+City)/i);
  if (cityMatch) return toTitleCase(cityMatch[1]);

  const areaMatch = raw.match(/area[:\s]+([A-Za-z\s]+)/i);
  if (areaMatch) return toTitleCase(areaMatch[1]);

  if (
    currentStep === 'area' &&
    /[a-z]/i.test(raw) &&
    !/\d/.test(raw) &&
    raw.length <= 40
  ) {
    return toTitleCase(raw);
  }

  return '';
}

function isFieldComplete(scenario, field) {
  switch (field) {
    case 'downPayment':
      return Boolean(
        scenario.downPaymentAmount !== '' || scenario.downPaymentPercent !== ''
      );
    default:
      return Boolean(scenario[field]);
  }
}

function getNextMissingField(scenario) {
  for (const field of STEP_ORDER) {
    if (!isFieldComplete(scenario, field)) {
      return field;
    }
  }
  return null;
}

function questionForField(field) {
  switch (field) {
    case 'language':
      return 'Would you like to continue in English or Spanish?';
    case 'loanType':
      return 'What loan type would you like me to price first: Conventional, FHA, VA, or USDA?';
    case 'occupancy':
      return 'Will this be primary, investment, or second home?';
    case 'purchasePrice':
      return 'What price range are you looking at?';
    case 'downPayment':
      return 'About how much are you planning to put down? You can tell me a dollar amount or percent.';
    case 'creditScore':
      return 'About what is your credit score?';
    case 'monthlyIncome':
      return 'What is your monthly income? If easier, tell me annual income and I will convert it.';
    case 'zipCode':
      return 'What property ZIP code are you looking in?';
    case 'area':
      return 'What city or county are you looking in?';
    default:
      return 'Tell me a little more about the scenario.';
  }
}

function buildSummary(scenario) {
  const parts = [];

  if (scenario.language) parts.push(`Language: ${scenario.language}`);
  if (scenario.loanType) parts.push(`Loan Type: ${scenario.loanType}`);
  if (scenario.loanPurpose) parts.push(`Loan Purpose: ${scenario.loanPurpose}`);
  if (scenario.occupancy) parts.push(`Occupancy: ${scenario.occupancy}`);
  if (scenario.purchasePrice) parts.push(`Purchase Price: $${Number(scenario.purchasePrice).toLocaleString()}`);
  if (scenario.downPaymentAmount) parts.push(`Down Payment: $${Number(scenario.downPaymentAmount).toLocaleString()}`);
  if (scenario.downPaymentPercent) parts.push(`Down Payment %: ${scenario.downPaymentPercent}%`);
  if (scenario.loanAmount) parts.push(`Loan Amount: $${Number(scenario.loanAmount).toLocaleString()}`);
  if (scenario.creditScore) parts.push(`Credit Score: ${scenario.creditScore}`);
  if (scenario.monthlyIncome) parts.push(`Monthly Income: $${Number(scenario.monthlyIncome).toLocaleString()}`);
  if (scenario.zipCode) parts.push(`ZIP Code: ${scenario.zipCode}`);
  if (scenario.area) parts.push(`Area: ${scenario.area}`);
  if (scenario.term) parts.push(`Loan Term: ${scenario.term}`);

  return parts.join(' | ');
}

function recalcScenario(input) {
  const next = { ...input };

  const purchasePrice = Number(next.purchasePrice) || 0;
  const downAmount = Number(next.downPaymentAmount) || 0;
  const downPercent = Number(next.downPaymentPercent) || 0;
  const loanAmount = Number(next.loanAmount) || 0;

  if (purchasePrice > 0) {
    if (!downAmount && downPercent > 0) {
      next.downPaymentAmount = Math.round((purchasePrice * downPercent) / 100);
    }

    if (!downPercent && downAmount > 0) {
      next.downPaymentPercent = Number(((downAmount / purchasePrice) * 100).toFixed(2));
    }

    if (!loanAmount) {
      next.loanAmount = Math.max(
        0,
        purchasePrice - (Number(next.downPaymentAmount) || 0)
      );
    }

    if (loanAmount > 0 && !downAmount) {
      const computedDown = Math.max(0, purchasePrice - loanAmount);
      next.downPaymentAmount = computedDown;
      next.downPaymentPercent = Number(((computedDown / purchasePrice) * 100).toFixed(2));
    }
  }

  if (!next.loanPurpose) {
    next.loanPurpose = 'Purchase';
  }

  if (!next.term) {
    next.term = '30-Year Fixed';
  }

  return next;
}

function extractScenarioUpdates(message, currentScenario, currentStep) {
  const raw = String(message || '').trim();
  const text = normalizeText(raw);
  const next = { ...currentScenario };
  let changed = false;

  const language = normalizeLanguage(raw);
  if (language && language !== next.language) {
    next.language = language;
    changed = true;
  }

  const purpose = normalizePurpose(raw);
  if (purpose && purpose !== next.loanPurpose) {
    next.loanPurpose = purpose;
    changed = true;
  }

  const loanType = normalizeLoanType(raw);
  if (loanType && loanType !== next.loanType) {
    next.loanType = loanType;
    changed = true;
  }

  const occupancy = normalizeOccupancy(raw);
  if (occupancy && occupancy !== next.occupancy) {
    next.occupancy = occupancy;
    changed = true;
  }

  const term = normalizeTerm(raw);
  if (term && term !== next.term) {
    next.term = term;
    changed = true;
  }

  const zipCode = parseZip(raw);
  if (zipCode && zipCode !== next.zipCode) {
    next.zipCode = zipCode;
    changed = true;
  }

  const area = parseArea(raw, currentStep);
  if (area && area !== next.area) {
    next.area = area;
    changed = true;
  }

  const creditScore =
    text.includes('credit') || text.includes('score') || currentStep === 'creditScore'
      ? normalizeCredit(raw)
      : '';
  if (creditScore && creditScore !== next.creditScore) {
    next.creditScore = creditScore;
    changed = true;
  }

  const purchasePrice =
    text.includes('purchase') ||
    text.includes('price') ||
    text.includes('looking at') ||
    text.includes('budget') ||
    text.includes('range') ||
    currentStep === 'purchasePrice'
      ? parsePriceRange(raw)
      : '';
  if (purchasePrice && purchasePrice !== next.purchasePrice) {
    next.purchasePrice = purchasePrice;
    changed = true;
  }

  const downPayment =
    text.includes('down') ||
    text.includes('%') ||
    currentStep === 'downPayment'
      ? parseDownPayment(raw, Number(next.purchasePrice) || 0)
      : null;
  if (downPayment) {
    if (
      downPayment.downPaymentAmount !== undefined &&
      downPayment.downPaymentAmount !== '' &&
      downPayment.downPaymentAmount !== next.downPaymentAmount
    ) {
      next.downPaymentAmount = downPayment.downPaymentAmount;
      changed = true;
    }

    if (
      downPayment.downPaymentPercent !== undefined &&
      downPayment.downPaymentPercent !== '' &&
      downPayment.downPaymentPercent !== next.downPaymentPercent
    ) {
      next.downPaymentPercent = downPayment.downPaymentPercent;
      changed = true;
    }
  }

  const incomeShouldParse =
    text.includes('income') ||
    text.includes('make') ||
    text.includes('earn') ||
    text.includes('per month') ||
    text.includes('a month') ||
    text.includes('per year') ||
    text.includes('a year') ||
    currentStep === 'monthlyIncome';

  if (incomeShouldParse) {
    const monthlyIncome = parseIncome(raw);
    if (monthlyIncome !== '' && monthlyIncome !== next.monthlyIncome) {
      next.monthlyIncome = monthlyIncome;
      changed = true;
    }
  }

  return {
    changed,
    scenario: recalcScenario(next),
  };
}

export function createEmptyScenario() {
  return {
    language: '',
    loanType: '',
    loanPurpose: '',
    term: '30-Year Fixed',
    occupancy: '',
    area: '',
    zipCode: '',
    purchasePrice: '',
    appraisalValue: '',
    downPaymentPercent: '',
    downPaymentAmount: '',
    loanAmount: '',
    creditScore: '',
    monthlyIncome: '',
  };
}

export function getInitialPrompt() {
  return "Hi, I'm Sally. I'll guide you step by step like a real loan officer would. You can reply in English or Español. Which language would you prefer?";
}

export function applyManualFieldUpdate(currentScenario, field, rawValue) {
  const next = { ...currentScenario };

  switch (field) {
    case 'language':
      next.language = normalizeLanguage(rawValue) || String(rawValue || '').trim();
      break;

    case 'loanType':
      next.loanType = normalizeLoanType(rawValue) || String(rawValue || '').trim();
      break;

    case 'loanPurpose':
      next.loanPurpose = normalizePurpose(rawValue) || String(rawValue || '').trim();
      break;

    case 'occupancy':
      next.occupancy = normalizeOccupancy(rawValue) || String(rawValue || '').trim();
      break;

    case 'term':
      next.term = normalizeTerm(rawValue) || String(rawValue || '').trim();
      break;

    case 'zipCode':
      next.zipCode = parseZip(rawValue) || String(rawValue || '').trim();
      break;

    case 'area':
      next.area = parseArea(rawValue, 'area') || String(rawValue || '').trim();
      break;

    case 'purchasePrice':
      next.purchasePrice = parseMoney(rawValue);
      break;

    case 'appraisalValue':
      next.appraisalValue = parseMoney(rawValue);
      break;

    case 'downPaymentPercent':
      next.downPaymentPercent = parseDownPayment(`${rawValue}%`, Number(next.purchasePrice) || 0)?.downPaymentPercent || '';
      break;

    case 'downPaymentAmount':
      next.downPaymentAmount = parseMoney(rawValue);
      break;

    case 'loanAmount':
      next.loanAmount = parseMoney(rawValue);
      break;

    case 'creditScore':
      next.creditScore = normalizeCredit(rawValue);
      break;

    case 'monthlyIncome':
      next.monthlyIncome = parseIncome(rawValue);
      break;

    default:
      next[field] = rawValue;
      break;
  }

  return recalcScenario(next);
}

export function processSallyMessage(message, currentScenario = createEmptyScenario()) {
  const intent = classifyIntent(message);
  const scenario = recalcScenario({ ...currentScenario });
  const currentStep = getNextMissingField(scenario);

  if (intent.type === 'empty') {
    return {
      message: questionForField(currentStep || 'language'),
      scenario,
    };
  }

  if (intent.type === 'reset') {
    const fresh = createEmptyScenario();
    return {
      message: getInitialPrompt(),
      scenario: fresh,
    };
  }

  if (intent.type === 'confirm_no') {
    return {
      message: 'No problem. Tell me what you would like to change and I will update it.',
      scenario,
    };
  }

  if (intent.type === 'confirm_yes') {
    const nextMissing = getNextMissingField(scenario);

    if (!nextMissing) {
      return {
        message: `Perfect. I now have a working scenario built for you. ${buildSummary(scenario)}`,
        scenario,
      };
    }

    return {
      message: questionForField(nextMissing),
      scenario,
    };
  }

  const extracted = extractScenarioUpdates(message, scenario, currentStep);
  const nextScenario = extracted.scenario;
  const nextMissing = getNextMissingField(nextScenario);

  if (!extracted.changed) {
    return {
      message: questionForField(currentStep || 'language'),
      scenario: nextScenario,
    };
  }

  if (!nextMissing) {
    return {
      message: `Here is what I am seeing so far: ${buildSummary(nextScenario)}. Does that look right?`,
      scenario: nextScenario,
    };
  }

  return {
    message: questionForField(nextMissing),
    scenario: nextScenario,
  };
}
