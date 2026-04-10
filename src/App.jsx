import React, { useEffect, useMemo, useState } from 'react';

export default function ChooseMyRateVoiceUI() {
  const [selectedRate, setSelectedRate] = useState('6.000%');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [chatInput, setChatInput] = useState('');
const [selectedRate, setSelectedRate] = useState('6.000%');
const [voiceEnabled, setVoiceEnabled] = useState(true);
const [chatInput, setChatInput] = useState('');

// 👉 AQUÍ MISMO 👇 (línea 7 está bien)
const [currentPrompt, setCurrentPrompt] = useState(
  "Hi, I'm Sally. I'll guide you step by step like a real loan officer would. You can reply in English or Español. Which language would you prefer?"
);

const [scenario, setScenario] = useState({
  const [scenario, setScenario] = useState({
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
    occupancy: '',
  });

const [currentPrompt, setCurrentPrompt] = useState(
  "Hi, I'm Sally. I'll guide you step by step like a real loan officer would. You can reply in English or Español. Which language would you prefer?"
);

  const [flow, setFlow] = useState({
    step: 'language',
    pendingPurchasePrice: null,
    pendingDownPaymentPercent: null,
    waitingForPriceConfirmation: false,
    waitingForDownPaymentConfirmation: false,
    waitingForLoanSummaryConfirmation: false,
  });


const addSallyMessage = (text) => {
  setCurrentPrompt(text);
  setTimeout(() => speakText(text), 100);
};

  const formatMoney = (value) => {
    if (value === '' || value === null || value === undefined) return '—';
    return `$${Number(value).toLocaleString()}`;
  };

  const parseNumber = (value) => {
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    if (!cleaned) return '';
    return Number(cleaned);
  };

  const parseZip = (value) => {
    const match = String(value).match(/\b\d{5}\b/);
    return match ? match[0] : '';
  };

  const normalizeLanguage = (value) => {
    const lower = value.toLowerCase();
    if (lower.includes('español') || lower.includes('espanol') || lower.includes('spanish')) return 'es';
    return 'en';
  };

  const normalizeLoanType = (value) => {
    const lower = value.toLowerCase();
    if (lower.includes('fha')) return 'FHA';
    if (lower.includes('conv')) return 'Conventional';
    if (lower.includes('conventional')) return 'Conventional';
    if (lower.includes('va')) return 'VA';
    return '';
  };

  const normalizePurpose = (value) => {
    const lower = value.toLowerCase();
    if (lower.includes('purchase') || lower.includes('buy') || lower.includes('compra')) return 'Purchase';
    if (lower.includes('refi') || lower.includes('refinance') || lower.includes('refinanc')) return 'Refinance';
    return '';
  };

  const normalizeOccupancy = (value) => {
    const lower = value.toLowerCase();
    if (lower.includes('primary') || lower.includes('primaria')) return 'Primary Residence';
    if (lower.includes('second') || lower.includes('segunda')) return 'Second Home';
    if (lower.includes('investment') || lower.includes('invers')) return 'Investment Property';
    return '';
  };

  const isYes = (value) => {
    const lower = value.toLowerCase().trim();
    return ['yes', 'y', 'sí', 'si', 'correct', 'correcto', 'okay', 'ok', 'sounds good', 'that works'].some((x) =>
      lower.includes(x)
    );
  };

  const isNo = (value) => {
    const lower = value.toLowerCase().trim();
    return ['no', 'not really', 'nope'].some((x) => lower.includes(x));
  };

  const soundsUncertain = (value) => {
    const lower = value.toLowerCase();
    return (
      lower.includes("don't know") ||
      lower.includes('not sure') ||
      lower.includes('no clue') ||
      lower.includes('not too') ||
      lower.includes('más o menos') ||
      lower.includes('no sé') ||
      lower.includes('no se') ||
      lower.includes('whatever the minimum') ||
      lower.includes('minimum down') ||
      lower.includes('mínimo') ||
      lower.includes('minimo')
    );
  };

  const detectPriceRange = (value) => {
    const nums = String(value).match(/\d[\d,]*/g);
    if (!nums || nums.length < 2) return null;
    const a = Number(nums[0].replace(/,/g, ''));
    const b = Number(nums[1].replace(/,/g, ''));
    if (!a || !b) return null;
    return {
      low: Math.min(a, b),
      high: Math.max(a, b),
      midpoint: Math.round((a + b) / 2),
    };
  }

  return null;
}

function recalcScenario(draft) {
  const next = { ...draft };

  const purchasePrice = Number(next.purchasePrice) || 0;
  const downPaymentAmount =
    next.downPaymentAmount === '' ? '' : Number(next.downPaymentAmount);
  const downPaymentPercent =
    next.downPaymentPercent === '' ? '' : Number(next.downPaymentPercent);
  const loanAmount = next.loanAmount === '' ? '' : Number(next.loanAmount);

  if (purchasePrice > 0) {
    if (downPaymentAmount !== '' && Number.isFinite(downPaymentAmount)) {
      next.loanAmount = Math.max(purchasePrice - downPaymentAmount, 0);
      next.downPaymentPercent = Number(((downPaymentAmount / purchasePrice) * 100).toFixed(2));
    } else if (downPaymentPercent !== '' && Number.isFinite(downPaymentPercent)) {
      const computedDown = Math.round((purchasePrice * downPaymentPercent) / 100);
      next.downPaymentAmount = computedDown;
      next.loanAmount = Math.max(purchasePrice - computedDown, 0);
    } else if (loanAmount !== '' && Number.isFinite(loanAmount)) {
      const computedDown = Math.max(purchasePrice - loanAmount, 0);
      next.downPaymentAmount = computedDown;
      next.downPaymentPercent = Number(((computedDown / purchasePrice) * 100).toFixed(2));
    }
  }

  return next;
}

function getFriendlyLanguage(value) {
  if (value === 'en') return 'English';
  if (value === 'es') return 'Espanol';
  return '-';
}

function buildReviewSummary(scenario) {
  return [
    'Perfect. Here is what I have so far:',
    `Language: ${getFriendlyLanguage(scenario.language)}`,
    `Loan Type: ${scenario.loanType || '-'}`,
    `Loan Term: ${scenario.term || '-'}`,
    `Loan Purpose: ${scenario.loanPurpose || '-'}`,
    `Occupancy: ${scenario.occupancy || '-'}`,
    `Purchase Price: ${formatMoney(scenario.purchasePrice)}`,
    `Area: ${scenario.area || '-'}`,
    `ZIP Code: ${scenario.zipCode || '-'}`,
    `Down Payment: ${formatMoney(scenario.downPaymentAmount)}`,
    `Down Payment %: ${
      scenario.downPaymentPercent !== '' && scenario.downPaymentPercent !== null && scenario.downPaymentPercent !== undefined
        ? `${scenario.downPaymentPercent}%`
        : '-'
    }`,
    `Estimated Loan Amount: ${formatMoney(scenario.loanAmount)}`,
    `Credit Score: ${scenario.creditScore || '-'}`,
    `Monthly Income: ${formatMoney(scenario.monthlyIncome)}`,
    '',
    'Does that look right?',
  ].join('\n');
}

function getPromptForStep(step, scenario = {}) {
  switch (step) {
    case 'language':
      return 'Hi, I’m Sally. I’ll guide you step by step just like a real loan officer would. Would you like to continue in English or Espanol?';
    case 'loanType':
      return 'Great. Which loan type would you like to explore: FHA, Conventional, VA, or USDA?';
    case 'term':
      return 'Perfect. Would you like a 30-Year Fixed or 15-Year Fixed?';
    case 'loanPurpose':
      return 'Are you looking to buy a home or refinance?';
    case 'occupancy':
      return 'Will this be your primary residence, second home, or investment property?';
    case 'purchasePrice':
      return 'What purchase price are you looking at?';
    case 'area':
      return 'What area or city are you looking in?';
    case 'zipCode':
      return 'What ZIP code are you looking in?';
    case 'downPayment':
      return 'How much are you thinking of putting down? You can say something like 20k down or 5%.';
    case 'creditScore':
      return 'About where do you think your credit score is right now?';
    case 'monthlyIncome':
      return 'About how much do you make per month before taxes?';
    case 'review':
      return buildReviewSummary(scenario);
    case 'complete':
      return 'Excellent. Your scenario is ready, and your pricing is now based on it. If you want to change anything, just tell me what to update or say start over.';
    case 'correctionField':
      return 'Of course. What would you like to change: language, loan type, term, purpose, occupancy, purchase price, area, ZIP code, down payment, credit score, or monthly income?';
    default:
      return 'Tell me a little more.';
  }
}

function getFieldStepFromCorrection(value) {
  const text = normalizeText(value);

  if (text.includes('language')) return 'language';
  if (text.includes('loan type') || text.includes('program') || text.includes('fha') || text.includes('conventional') || text.includes('va') || text.includes('usda')) return 'loanType';
  if (text.includes('term') || text.includes('15 year') || text.includes('30 year')) return 'term';
  if (text.includes('purpose') || text.includes('purchase') || text.includes('refinance')) return 'loanPurpose';
  if (text.includes('occupancy') || text.includes('primary') || text.includes('second') || text.includes('investment')) return 'occupancy';
  if (text.includes('price')) return 'purchasePrice';
  if (text.includes('area') || text.includes('city')) return 'area';
  if (text.includes('zip')) return 'zipCode';
  if (text.includes('down')) return 'downPayment';
  if (text.includes('credit')) return 'creditScore';
  if (text.includes('income')) return 'monthlyIncome';

  return '';
}

function detectInlineCorrection(answer) {
  const text = normalizeText(answer);

  if (text.includes('switch to fha') || text === 'fha') {
    return { field: 'loanType', value: 'FHA' };
  }
  if (text.includes('switch to conventional') || text === 'conventional') {
    return { field: 'loanType', value: 'Conventional' };
  }
  if (text.includes('switch to va') || text === 'va') {
    return { field: 'loanType', value: 'VA' };
  }
  if (text.includes('switch to usda') || text === 'usda') {
    return { field: 'loanType', value: 'USDA' };
  }

  if (text.includes('make it investment') || text.includes('change to investment')) {
    return { field: 'occupancy', value: 'Investment Property' };
  }
  if (text.includes('make it primary') || text.includes('change to primary')) {
    return { field: 'occupancy', value: 'Primary Residence' };
  }
  if (text.includes('make it second home') || text.includes('change to second home')) {
    return { field: 'occupancy', value: 'Second Home' };
  }

  if (
    (text.includes('price') || text.includes('purchase price')) &&
    /\d/.test(text)
  ) {
    return { field: 'purchasePrice', value: parseMoney(text) };
  }

  if (text.includes('zip') && /\d{5}/.test(text)) {
    return { field: 'zipCode', value: parseZip(text) };
  }

  if (
    (text.includes('income') ||
      text.includes('monthly income') ||
      text.includes('annual income') ||
      text.includes('per year') ||
      text.includes('a year') ||
      text.includes('per month') ||
      text.includes('a month')) &&
    /\d/.test(text)
  ) {
    return { field: 'monthlyIncome', value: parseIncome(text) };
  }

  if (
    (text.includes('credit') || text.includes('score')) &&
    /\d/.test(text)
  ) {
    return { field: 'creditScore', value: normalizeCredit(text) };
  }

  if ((text.includes('down') || text.includes('%')) && /\d/.test(text)) {
    return { field: 'downPayment', value: text };
  }

  return null;
}

function applyFieldUpdate(scenario, field, rawValue) {
  const next = { ...scenario };

  switch (field) {
    case 'language': {
      const language = normalizeLanguage(rawValue);
      if (!language) return scenario;
      next.language = language;
      return next;
    }

    case 'loanType': {
      const loanType =
        typeof rawValue === 'string' &&
        ['FHA', 'Conventional', 'VA', 'USDA'].includes(rawValue)
          ? rawValue
          : normalizeLoanType(rawValue);

      if (!loanType) return scenario;
      next.loanType = loanType;
      return next;
    }

    case 'term': {
      const term = normalizeTerm(rawValue);
      if (!term) return scenario;
      next.term = term;
      return next;
    }

    case 'loanPurpose': {
      const purpose = normalizePurpose(rawValue);
      if (!purpose) return scenario;
      next.loanPurpose = purpose;
      return next;
    }

    case 'occupancy': {
      const occupancy =
        ['Primary Residence', 'Second Home', 'Investment Property'].includes(rawValue)
          ? rawValue
          : normalizeOccupancy(rawValue);

      if (!occupancy) return scenario;
      next.occupancy = occupancy;
      return next;
    }

    case 'purchasePrice': {
      const price = typeof rawValue === 'number' ? rawValue : parseMoney(rawValue);
      if (price === '') return scenario;
      next.purchasePrice = price;
      return recalcScenario(next);
    }

    case 'area': {
      next.area = String(rawValue || '').trim();
      return next;
    }

    case 'zipCode': {
      const zip = parseZip(rawValue);
      if (zip.length !== 5) return scenario;
      next.zipCode = zip;
      return next;
    }

    case 'downPayment': {
      const down = parseDownPayment(rawValue, Number(next.purchasePrice) || 0);
      if (!down) return scenario;
      next.downPaymentAmount = down.downPaymentAmount ?? '';
      next.downPaymentPercent = down.downPaymentPercent ?? '';
      return recalcScenario(next);
    }

    case 'creditScore': {
      const credit = typeof rawValue === 'string' ? normalizeCredit(rawValue) : '';
      if (!credit) return scenario;
      next.creditScore = credit;
      return next;
    }

    case 'monthlyIncome': {
      const income = typeof rawValue === 'number' ? rawValue : parseIncome(rawValue);
      if (income === '') return scenario;
      next.monthlyIncome = income;
      return next;
    }

    default:
      return scenario;
  }
}

export default function ChooseMyRateVoiceUI() {
  const [selectedRate, setSelectedRate] = useState('6.000%');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [chatInput, setChatInput] = useState('');
  const [currentPrompt, setCurrentPrompt] = useState(getPromptForStep('language'));
  const [flow, setFlow] = useState({
    step: 'language',
    correctionTarget: '',
  });
  const [scenario, setScenario] = useState(createEmptyScenario());

  const speakText = (text) => {
    if (!voiceEnabled) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const speakLatest = () => {
    speakText(currentPrompt);
  };

  const resetScenario = () => {
    setScenario(createEmptyScenario());
    setFlow({ step: 'language', correctionTarget: '' });
    setCurrentPrompt(getPromptForStep('language'));
    setChatInput('');
  };

  const updateScenarioField = (field, rawValue) => {
    setScenario((prev) => {
      let next = { ...prev };

      if (field === 'language') {
        next.language = rawValue;
        return next;
      }

      if (field === 'loanType') {
        next.loanType = rawValue;
        return next;
      }

      if (field === 'term') {
        next.term = rawValue;
        return next;
      }

      if (field === 'loanPurpose') {
        next.loanPurpose = rawValue;
        return next;
      }

      if (field === 'occupancy') {
        next.occupancy = rawValue;
        return next;
      }

      if (field === 'zipCode') {
        next.zipCode = parseZip(rawValue);
        return next;
      }

      if (
        field === 'purchasePrice' ||
        field === 'appraisalValue' ||
        field === 'downPaymentPercent' ||
        field === 'downPaymentAmount' ||
        field === 'loanAmount' ||
        field === 'monthlyIncome'
      ) {
        const parsedValue = rawValue === '' ? '' : parseMoney(rawValue);
        next[field] = parsedValue;
        return recalcScenario(next);
      }

      if (field === 'creditScore') {
        next.creditScore = rawValue;
        return next;
      }

      if (field === 'area') {
        next.area = rawValue;
        return next;
      }

      return next;
    });
  };

  const pricingExplanation = useMemo(() => {
    const reasons = [];
    const pricingScore = scoreForPricing(scenario.creditScore);

    if (scenario.loanType === 'FHA') {
      reasons.push('because FHA pricing is being used');
    } else if (scenario.loanType === 'VA') {
      reasons.push('because VA pricing can be more favorable');
    } else if (scenario.loanType === 'Conventional') {
      reasons.push('because conventional pricing is being used');
    } else if (scenario.loanType === 'USDA') {
      reasons.push('because USDA pricing is being used');
    }

    if (pricingScore >= 760) {
      reasons.push('because stronger credit helped pricing');
    } else if (pricingScore >= 720) {
      reasons.push('because good credit helped pricing');
    } else if (pricingScore && pricingScore < 680) {
      reasons.push('because a lower credit score can increase pricing');
    }

    if (Number(scenario.loanAmount) > 600000) {
      reasons.push('because the loan amount is higher');
    }

    if (reasons.length === 0) {
      return 'Your pricing is based on the current scenario.';
    }

    return `Your rates changed ${reasons.join(', ')}.`;
  }, [scenario]);

  const rates = useMemo(() => {
    let baseRate = 6.0;
    const pricingScore = scoreForPricing(scenario.creditScore);

    const calculatePayment = (loanAmount, annualRate, termMonths = 360) => {
      if (!loanAmount || !annualRate) return '$0';
      const monthlyRate = annualRate / 100 / 12;
      const payment = (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
      return `$${Math.round(payment).toLocaleString()}`;
    };

    const calcPriceDollar = (percent) => {
      if (!scenario.loanAmount) return '$0';
      const amount = Math.round((Number(scenario.loanAmount) * Math.abs(percent)) / 100);
      if (percent > 0) return `+$${amount.toLocaleString()}`;
      if (percent < 0) return `-$${amount.toLocaleString()}`;
      return '$0';
    };

    if (pricingScore >= 760) baseRate -= 0.25;
    else if (pricingScore >= 720) baseRate -= 0.125;
    else if (pricingScore && pricingScore < 680) baseRate += 0.25;

    if (scenario.loanType === 'FHA') baseRate += 0.125;
    if (scenario.loanType === 'VA') baseRate -= 0.125;
    if (Number(scenario.loanAmount) > 600000) baseRate += 0.125;

    const formatRate = (r) => `${r.toFixed(3)}%`;

    return [
      {
        rate: formatRate(baseRate + 0.5),
        type: 'Credit',
        pct: '+1.000%',
        dollars: calcPriceDollar(1.0),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate + 0.5),
      },
      {
        rate: formatRate(baseRate + 0.375),
        type: 'Credit',
        pct: '+0.750%',
        dollars: calcPriceDollar(0.75),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate + 0.375),
      },
      {
        rate: formatRate(baseRate + 0.25),
        type: 'Credit',
        pct: '+0.500%',
        dollars: calcPriceDollar(0.5),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate + 0.25),
      },
      {
        rate: formatRate(baseRate + 0.125),
        type: 'Credit',
        pct: '+0.375%',
        dollars: calcPriceDollar(0.375),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate + 0.125),
      },
      {
        rate: formatRate(baseRate),
        type: 'Par',
        pct: '0.000%',
        dollars: '$0',
        payment: calculatePayment(Number(scenario.loanAmount), baseRate),
      },
      {
        rate: formatRate(baseRate - 0.125),
        type: 'Cost',
        pct: '-0.375%',
        dollars: calcPriceDollar(-0.375),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate - 0.125),
      },
      {
        rate: formatRate(baseRate - 0.25),
        type: 'Cost',
        pct: '-0.750%',
        dollars: calcPriceDollar(-0.75),
        payment: calculatePayment(Number(scenario.loanAmount), baseRate - 0.25),
      },
    ];
  }, [scenario]);

  const currentRate = useMemo(() => {
    return rates.find((r) => r.rate === selectedRate) || rates[4];
  }, [selectedRate, rates]);

  const speakLatest = () => {
    const lastSallyMessage = [...messages].reverse().find((m) => m.role === 'sally');
    if (lastSallyMessage) speakText(lastSallyMessage.text);
  };

  const handleSend = () => {
    const answer = chatInput.trim();
    if (!answer) return;

   
    setChatInput('');

    if (flow.step === 'language') {
      const language = normalizeLanguage(answer);
      setScenario((prev) => ({ ...prev, language }));
      setFlow((prev) => ({ ...prev, step: 'loanType' }));

      addSallyMessage(
        language === 'es'
          ? 'Perfecto. Te voy a guiar paso a paso como si estuviéramos hablando directamente. ¿Qué tipo de préstamo estás considerando? Por ejemplo: FHA, convencional o VA.'
          : 'Perfect. I’ll guide you step by step like a real loan officer would. What type of loan are you thinking about? For example: FHA, Conventional, or VA.'
      );
      return;
    }

    if (flow.step === 'loanType') {
      const loanType = normalizeLoanType(answer);
      if (!loanType) {
        addSallyMessage(
          scenario.language === 'es'
            ? 'Solo para confirmar, ¿estás pensando en FHA, convencional o VA?'
            : 'Just to confirm, are you thinking FHA, Conventional, or VA?'
        );
        return;
      }

      setScenario((prev) => ({ ...prev, loanType }));
      setFlow((prev) => ({ ...prev, step: 'purpose' }));

      addSallyMessage(
        scenario.language === 'es'
          ? 'Perfecto. ¿Esto sería para compra o refinanciamiento?'
          : 'Perfect. Would this be for a purchase or a refinance?'
      );
      return;
    }

    if (flow.step === 'purpose') {
      const purpose = normalizePurpose(answer);
      if (!purpose) {
        addSallyMessage(
          scenario.language === 'es'
            ? 'Solo para confirmar, ¿sería compra o refinanciamiento?'
            : 'Just to confirm, would this be for a purchase or a refinance?'
        );
        return;
      }

      setScenario((prev) => ({ ...prev, purpose }));
      setFlow((prev) => ({ ...prev, step: 'area' }));

      addSallyMessage(
        scenario.language === 'es'
          ? 'Buenísimo. ¿En qué área o ciudad estás pensando? Si sabes el zip code también me sirve.'
          : 'Great. What area or city are you thinking about? If you know the zip code too, that helps.'
      );
      return;
    }

    if (flow.step === 'area') {
      const zip = parseZip(answer);
      setScenario((prev) => ({
        ...prev,
        area: answer,
        zipCode: zip || '',
      }));
      setFlow((prev) => ({ ...prev, step: 'priceDiscovery' }));

      addSallyMessage(
        scenario.language === 'es'
          ? 'Perfecto. ¿Más o menos en qué rango de precio estás pensando? Si no estás seguro, dame una idea aproximada y yo te ayudo.'
          : "Perfect. About what price range are you thinking? If you're not sure, give me a rough idea and I'll help you."
      );
      return;
    }

    if (flow.step === 'priceDiscovery') {
      const directPrice = parseNumber(answer);
      const range = detectPriceRange(answer);

      if (range) {
        const price = range.midpoint;
        setFlow((prev) => ({
          ...prev,
          pendingPurchasePrice: price,
          waitingForPriceConfirmation: true,
          step: 'priceConfirmation',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? `Está bien. Si usamos ${formatMoney(price)} como ejemplo de trabajo dentro de ese rango, ¿te parece bien?`
            : `That’s fine. If we use ${formatMoney(price)} as a working example within that range, would that be okay?`
        );
        return;
      }

      if (directPrice && directPrice >= 10000) {
        setScenario((prev) => ({ ...prev, purchasePrice: directPrice }));
        setFlow((prev) => ({ ...prev, step: 'downPaymentDiscovery' }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'Perfecto. ¿Ya sabes cuánto quieres poner de enganche, o quieres que te guíe con el mínimo para ese programa?'
            : 'Perfect. Do you already know how much you want to put down, or would you like me to guide you with the minimum down payment for that program?'
        );
        return;
      }

      if (soundsUncertain(answer)) {
        setFlow((prev) => ({
          ...prev,
          pendingPurchasePrice: '',
          waitingForPriceConfirmation: false,
          step: 'priceGuidance',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'No te preocupes, eso es muy común. Dame una idea general. Por ejemplo, ¿estás pensando más cerca de 400 mil, 500 mil o 600 mil?'
            : "No problem, that’s very common. Give me a general idea. For example, are you thinking closer to 400, 500, or 600 thousand?"
        );
        return;
      }

      addSallyMessage(
        scenario.language === 'es'
          ? 'No te entendí bien el precio. ¿Me puedes dar un precio aproximado, por ejemplo 500000, o un rango como 500 a 600?'
          : 'I didn’t quite catch the price. Can you give me an approximate price, for example 500000, or a range like 500 to 600?'
      );
      return;
    }

    if (flow.step === 'priceGuidance') {
      const directPrice = parseNumber(answer);
      const range = detectPriceRange(answer);

      if (range) {
        const price = range.midpoint;
        setFlow((prev) => ({
          ...prev,
          pendingPurchasePrice: price,
          waitingForPriceConfirmation: true,
          step: 'priceConfirmation',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? `Perfecto. Si usamos ${formatMoney(price)} como ejemplo de trabajo, ¿te parece bien?`
            : `Perfect. If we use ${formatMoney(price)} as a working example, does that sound okay?`
        );
        return;
      }

      if (directPrice && directPrice >= 10000) {
        setScenario((prev) => ({ ...prev, purchasePrice: directPrice }));
        setFlow((prev) => ({ ...prev, step: 'downPaymentDiscovery' }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'Perfecto. ¿Ya sabes cuánto quieres poner de enganche, o quieres que te guíe con el mínimo para ese programa?'
            : 'Perfect. Do you already know how much you want to put down, or would you like me to guide you with the minimum down payment for that program?'
        );
        return;
      }

      addSallyMessage(
        scenario.language === 'es'
          ? 'Dame un número aproximado para trabajar, como 500000, y yo te ayudo desde ahí.'
          : 'Give me an approximate number to work with, like 500000, and I’ll guide you from there.'
      );
      return;
    }

    if (flow.step === 'priceConfirmation') {
      if (isYes(answer)) {
        setScenario((prev) => ({ ...prev, purchasePrice: flow.pendingPurchasePrice }));
        setFlow((prev) => ({
          ...prev,
          pendingPurchasePrice: null,
          waitingForPriceConfirmation: false,
          step: 'downPaymentDiscovery',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'Perfecto. ¿Ya sabes cuánto quieres poner de enganche, o quieres que te guíe con el mínimo para ese programa?'
            : 'Perfect. Do you already know how much you want to put down, or would you like me to guide you with the minimum down payment for that program?'
        );
        return;
      }

      if (isNo(answer)) {
        setFlow((prev) => ({
          ...prev,
          pendingPurchasePrice: null,
          waitingForPriceConfirmation: false,
          step: 'priceGuidance',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'Está bien. Entonces dame un rango o un número que se sienta más cerca de lo que quieres.'
            : 'That’s fine. Then give me a range or a number that feels closer to what you want.'
        );
        return;
      }

      addSallyMessage(
        scenario.language === 'es'
          ? 'Solo para confirmar, ¿sí te parece bien usar ese precio como ejemplo de trabajo?'
          : 'Just to confirm, are you okay using that price as the working example?'
      );
      return;
    }

    if (flow.step === 'downPaymentDiscovery') {
      const lower = answer.toLowerCase();
      const purchasePrice = scenario.purchasePrice || 0;
      const defaultPercent = getDefaultDownPaymentPercent(scenario.loanType);

      if (
        lower.includes('minimum') ||
        lower.includes('mínimo') ||
        lower.includes('minimo') ||
        lower.includes("don't know") ||
        lower.includes('not sure') ||
        lower.includes('no sé') ||
        lower.includes('no se')
      ) {
        const dpAmount = calculateDownPaymentAmount(purchasePrice, defaultPercent);
        const loanAmount = calculateLoanAmount(purchasePrice, dpAmount);

        setFlow((prev) => ({
          ...prev,
          pendingDownPaymentPercent: defaultPercent,
          waitingForDownPaymentConfirmation: true,
          step: 'downPaymentConfirmation',
        }));

        addSallyMessage(
          buildWorkingScenarioText(
            scenario.language,
            purchasePrice,
            defaultPercent,
            dpAmount,
            loanAmount
          )
        );
        return;
      }

      if (lower.includes('%')) {
        const percent = parseNumber(answer);
        if (percent > 0) {
          const dpAmount = calculateDownPaymentAmount(purchasePrice, percent);
          const loanAmount = calculateLoanAmount(purchasePrice, dpAmount);

          setFlow((prev) => ({
            ...prev,
            pendingDownPaymentPercent: percent,
            waitingForDownPaymentConfirmation: true,
            step: 'downPaymentConfirmation',
          }));

          addSallyMessage(
            buildWorkingScenarioText(
              scenario.language,
              purchasePrice,
              percent,
              dpAmount,
              loanAmount
            )
          );
          return;
        }
      }

      const rawAmount = parseNumber(answer);
      if (rawAmount > 0) {
        if (rawAmount < 100) {
          const percent = rawAmount;
          const dpAmount = calculateDownPaymentAmount(purchasePrice, percent);
          const loanAmount = calculateLoanAmount(purchasePrice, dpAmount);

          setFlow((prev) => ({
            ...prev,
            pendingDownPaymentPercent: percent,
            waitingForDownPaymentConfirmation: true,
            step: 'downPaymentConfirmation',
          }));

          addSallyMessage(
            buildWorkingScenarioText(
              scenario.language,
              purchasePrice,
              percent,
              dpAmount,
              loanAmount
            )
          );
          return;
        }

        const dpAmount = rawAmount;
        const percent = Number(((dpAmount / purchasePrice) * 100).toFixed(3));
        const loanAmount = calculateLoanAmount(purchasePrice, dpAmount);

        setFlow((prev) => ({
          ...prev,
          pendingDownPaymentPercent: percent,
          waitingForDownPaymentConfirmation: true,
          step: 'downPaymentConfirmation',
        }));

        addSallyMessage(
          buildWorkingScenarioText(
            scenario.language,
            purchasePrice,
            percent,
            dpAmount,
            loanAmount
          )
        );
        return;
      }

      addSallyMessage(
        scenario.language === 'es'
          ? 'Si quieres, te puedo guiar con el mínimo de enganche, o me puedes dar un porcentaje como 5%, o una cantidad como 25000.'
          : 'If you want, I can guide you with the minimum down payment, or you can give me a percent like 5%, or an amount like 25000.'
      );
      return;
    }

    if (flow.step === 'downPaymentConfirmation') {
      if (isYes(answer)) {
        const percent = flow.pendingDownPaymentPercent;
        const dpAmount = calculateDownPaymentAmount(scenario.purchasePrice, percent);
        const loanAmount = calculateLoanAmount(scenario.purchasePrice, dpAmount);

        setScenario((prev) => ({
          ...prev,
          downPaymentPercent: percent,
          downPaymentAmount: dpAmount,
          loanAmount,
        }));

        setFlow((prev) => ({
          ...prev,
          pendingDownPaymentPercent: null,
          waitingForDownPaymentConfirmation: false,
          step: 'creditScore',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'Perfecto. ¿Cuál dirías que es tu puntaje de crédito aproximado?'
            : 'Perfect. What would you say your estimated credit score is?'
        );
        return;
      }

      if (isNo(answer)) {
        setFlow((prev) => ({
          ...prev,
          pendingDownPaymentPercent: null,
          waitingForDownPaymentConfirmation: false,
          step: 'downPaymentDiscovery',
        }));

        addSallyMessage(
          scenario.language === 'es'
            ? 'No hay problema. Entonces dime cuánto te gustaría poner de enganche, o qué porcentaje te gustaría usar.'
            : 'No problem. Then tell me how much you would like to put down, or what percent you want to use.'
        );
        return;
      }

      addSallyMessage(
        scenario.language === 'es'
          ? 'Solo para confirmar, ¿te parece bien usar ese enganche y ese monto estimado de préstamo?'
          : 'Just to confirm, are you okay using that down payment and estimated loan amount?'
      );
      return;
    }

    if (flow.step === 'creditScore') {
      const score = parseNumber(answer);
      if (!score || score < 300 || score > 850) {
        addSallyMessage(
          scenario.language === 'es'
            ? 'No me sonó bien ese puntaje. ¿Me puedes dar un puntaje aproximado entre 300 y 850?'
            : 'That credit score does not sound right. Can you give me an approximate score between 300 and 850?'
        );
        return;
      }

      setScenario((prev) => ({ ...prev, creditScore: score }));
      setFlow((prev) => ({ ...prev, step: 'occupancy' }));

      addSallyMessage(
        scenario.language === 'es'
          ? 'Perfecto. ¿La propiedad sería residencia primaria, segunda casa o inversión?'
          : 'Perfect. Would this property be your primary residence, second home, or investment property?'
      );
      return;
    }

    if (flow.step === 'occupancy') {
      const occupancy = normalizeOccupancy(answer);
      if (!occupancy) {
        addSallyMessage(
          scenario.language === 'es'
            ? 'Solo para confirmar, ¿sería residencia primaria, segunda casa o inversión?'
            : 'Just to confirm, would this be primary residence, second home, or investment property?'
        );
        return;
      }

      setScenario((prev) => ({ ...prev, occupancy }));
      setFlow((prev) => ({ ...prev, step: 'complete' }));

      addSallyMessage(
        scenario.language === 'es'
          ? `Perfecto. Ya tengo un escenario de trabajo armado para ti. ${pricingExplanation}`
          : `Perfect. I now have a working scenario built for you. ${pricingExplanation}`
      );
      return;
    }
  };

  return (
    <div
      style={{
        background: 'radial-gradient(circle at top, #14305f 0%, #0b2340 58%, #08192f 100%)',
        minHeight: '100vh',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          padding: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            background: 'white',
            padding: '10px 14px',
            borderRadius: 8,
            color: '#0b2340',
            fontWeight: 800,
          }}
        >
          HOME LENDERS OF AMERICA
        </div>

        <div style={{ color: 'white', fontWeight: 600 }}>Apply Online</div>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 30, marginTop: 28 }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: '#ffffff', letterSpacing: 2 }}>
          CHOOSE MY RATE
        </div>

        <div
          style={{
            marginTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              height: 2,
              width: 80,
              background: 'linear-gradient(to right, transparent, #ef4444)',
              marginRight: 12,
            }}
          />
          <span style={{ fontSize: 22, color: '#ef4444', fontWeight: 700, letterSpacing: 1 }}>
            The Power to Choose
          </span>
          <div
            style={{
              height: 2,
              width: 80,
              background: 'linear-gradient(to left, transparent, #ef4444)',
              marginLeft: 12,
            }}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1380, margin: '0 auto', padding: '12px 28px 0' }}>
        <div
          style={{
            background: 'rgba(19, 35, 67, 0.82)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
            padding: 24,
            borderRadius: 22,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700 }}>Sally AI Conversation</div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button
                onClick={() => setVoiceEnabled((prev) => !prev)}
                style={{
                  background: voiceEnabled ? '#22c55e' : 'rgba(255,255,255,0.08)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {voiceEnabled ? 'Voice On' : 'Voice Off'}
              </button>

              <button
                onClick={speakLatest}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                Speak
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '75%',
                    background:
                      message.role === 'user'
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(255,255,255,0.06)',
                    color: 'white',
                    borderRadius: 18,
                    padding: '13px 16px',
                    lineHeight: 1.45,
                    border: '1px solid rgba(255,255,255,0.08)',
                    fontSize: 16,
                  }}
                >
                  <strong>{message.role === 'user' ? 'You' : 'Sally'}:</strong> {message.text}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder={flow.step === 'complete' ? 'Scenario complete' : 'Reply here to Sally...'}
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 16,
                  padding: '16px 18px',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 16,
                  outline: 'none',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
              <button
                onClick={handleSend}
                style={{
                  minWidth: 130,
                  background: '#ffffff',
                  color: '#0b2340',
                  borderRadius: 16,
                  border: 'none',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '0.82fr 1.18fr', gap: 24 }}>
          <div
            style={{
              background: 'rgba(19, 35, 67, 0.82)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
              padding: 24,
              borderRadius: 22,
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 18 }}>Loan Scenario</div>
            <div style={{ display: 'grid', gap: 14 }}>
              <ScenarioField label="Language" value={scenario.language === 'es' ? 'Español' : scenario.language ? 'English' : '—'} />
              <ScenarioField label="Loan Type" value={scenario.loanType || '—'} />
              <ScenarioField label="Loan Term" value={scenario.term || '—'} />
              <ScenarioField label="Loan Purpose" value={scenario.purpose || '—'} />
              <ScenarioField label="Area / Zip" value={scenario.area || scenario.zipCode || '—'} />
              <ScenarioField label="Purchase Price" value={scenario.purchasePrice ? formatMoney(scenario.purchasePrice) : '—'} />
              <ScenarioField label="Down Payment %" value={scenario.downPaymentPercent ? `${scenario.downPaymentPercent}%` : '—'} />
              <ScenarioField label="Down Payment $" value={scenario.downPaymentAmount ? formatMoney(scenario.downPaymentAmount) : '—'} />
              <ScenarioField label="Loan Amount" value={scenario.loanAmount ? formatMoney(scenario.loanAmount) : '—'} />
              <ScenarioField label="Credit Score" value={scenario.creditScore || '—'} />
              <ScenarioField label="Zip Code" value={scenario.zipCode || '—'} />
              <ScenarioField label="Occupancy" value={scenario.occupancy || '—'} />
            </div>
          </div>

          <div
            style={{
              background: 'rgba(19, 35, 67, 0.82)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 18px 50px rgba(0,0,0,0.25)',
              padding: 24,
              borderRadius: 22,
            }}
          >
            <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 8 }}>Choose Your Rate</div>

            <div style={{ color: '#dbe7ff', marginBottom: 18, lineHeight: 1.5 }}>
              {pricingExplanation}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.05fr 1fr 1fr 1fr',
                gap: 10,
                padding: '0 8px 12px',
                color: '#cfcfcf',
                fontSize: 14,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
                fontWeight: 700,
              }}
            >
              <div>Interest Rate</div>
              <div>
                <span style={{ color: '#22c55e' }}>Credit</span> / <span style={{ color: '#ef4444' }}>Cost</span>
              </div>
              <div>Dollar Amount</div>
              <div>Monthly Payment</div>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {rates.map((row) => (
                <RateRow
                  key={row.rate}
                  rate={row.rate}
                  type={row.type}
                  pct={row.pct}
                  dollars={row.dollars}
                  payment={row.payment}
                  highlight={row.rate === selectedRate}
                  onClick={() => setSelectedRate(row.rate)}
                />
              ))}
            </div>

            <div
              style={{
                marginTop: 18,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                padding: '14px 16px',
              }}
            >
              <div style={{ fontSize: 12, color: '#a9b6cc', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Selected Rate
              </div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 700 }}>
                {currentRate.rate} | {currentRate.payment}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditableScenarioField({
  label,
  field,
  value,
  onSave,
  type = 'text',
  options = [],
  formatValue,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(value ?? '');

  useEffect(() => {
    setDraftValue(value ?? '');
  }, [value]);

  const displayValue = formatValue ? formatValue(value) : value || '-';

  return (
    <div
      onClick={() => {
        if (!isEditing) setIsEditing(true);
      }}
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '14px 16px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: '#a9b6cc',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </div>

      <div style={{ marginTop: 8 }}>
        {isEditing ? (
          type === 'select' ? (
            <select
              autoFocus
              value={draftValue}
              onChange={(e) => {
                const next = e.target.value;
                setDraftValue(next);
                onSave(field, next);
                setIsEditing(false);
              }}
              onBlur={() => setIsEditing(false)}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 18,
                fontWeight: 600,
                outline: 'none',
              }}
            >
              <option value="">Select</option>
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  style={{ color: 'black' }}
                >
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={() => {
                onSave(field, draftValue);
                setIsEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave(field, draftValue);
                  setIsEditing(false);
                }
              }}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.08)',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
                fontSize: 18,
                fontWeight: 600,
                outline: 'none',
              }}
            />
          )
        ) : (
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {displayValue}
          </div>
        )}
      </div>
    </div>
  );
}
function EditableInput({ label, value, onChange }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: '#a9b6cc', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>
      <input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'white',
          fontSize: 20,
          fontWeight: 600,
        }}
      />
    </div>
  );
}

function EditableSelect({ label, value, options, onChange }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: '#a9b6cc', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </div>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{
          marginTop: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: 'white',
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        <option value="" style={{ color: 'black' }}>
          Select
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value} style={{ color: 'black' }}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}


function RateRow({ rate, type, pct, dollars, payment, highlight, onClick }) {
  const typeColor = type === 'Credit' ? '#86efac' : type === 'Cost' ? '#f87171' : '#ffffff';
  const dollarsColor = dollars.includes('+') ? '#86efac' : dollars.includes('-') ? '#f87171' : '#ffffff';

  return (
    <button
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '1.05fr 1fr 1fr 1fr',
        gap: 10,
        alignItems: 'center',
        padding: '16px 14px',
        background: highlight ? 'rgba(239,68,68,0.10)' : 'rgba(255,255,255,0.04)',
        border: highlight ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        color: 'white',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: highlight ? '0 0 0 1px rgba(239,68,68,0.15), 0 12px 24px rgba(0,0,0,0.12)' : 'none',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 18 }}>{rate}</div>
      <div>
        <div style={{ fontWeight: 700, color: typeColor }}>{type}</div>
        <div style={{ color: typeColor, fontSize: 13 }}>{pct}</div>
      </div>
      <div style={{ fontWeight: 700, color: dollarsColor }}>{dollars}</div>
      <div style={{ fontWeight: 700 }}>{payment}</div>
    </button>
  );
}