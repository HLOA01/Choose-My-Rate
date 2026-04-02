import React, { useMemo, useState } from 'react';

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
    term: '30-Year Fixed',
    purpose: 'Purchase',
    area: '',
    zipCode: '',
    purchasePrice: '',
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
  };

  const getDefaultDownPaymentPercent = (loanType) => {
    if (loanType === 'FHA') return 3.5;
    if (loanType === 'Conventional') return 5.0;
    if (loanType === 'VA') return 0.0;
    return 5.0;
  };

  const calculateDownPaymentAmount = (purchasePrice, percent) => {
    if (!purchasePrice && purchasePrice !== 0) return '';
    if (!percent && percent !== 0) return '';
    return Math.round((purchasePrice * percent) / 100);
  };

  const calculateLoanAmount = (purchasePrice, downPaymentAmount) => {
    if (!purchasePrice && purchasePrice !== 0) return '';
    if (!downPaymentAmount && downPaymentAmount !== 0) return '';
    return Math.round(purchasePrice - downPaymentAmount);
  };

  const buildWorkingScenarioText = (language, purchasePrice, downPaymentPercent, downPaymentAmount, loanAmount) => {
    if (language === 'es') {
      return `Si usamos ${formatMoney(
        purchasePrice
      )} como ejemplo, con un enganche de ${downPaymentPercent}% estaríamos hablando de aproximadamente ${formatMoney(
        downPaymentAmount
      )} de enganche y un monto estimado de préstamo de ${formatMoney(
        loanAmount
      )}. ¿Te parece bien que usemos eso como escenario de trabajo?`;
    }

    return `If we use ${formatMoney(
      purchasePrice
    )} as a working example, with a ${downPaymentPercent}% down payment that would be about ${formatMoney(
      downPaymentAmount
    )} down and an estimated loan amount of ${formatMoney(
      loanAmount
    )}. Does that sound okay as a working scenario?`;
  };

  const pricingExplanation = useMemo(() => {
    const reasons = [];

    if (scenario.loanType === 'FHA') {
      reasons.push(
        scenario.language === 'es'
          ? 'porque el pricing FHA normalmente es un poco más alto que algunas opciones convencionales'
          : 'because FHA pricing is usually a little higher than some conventional options'
      );
    } else if (scenario.loanType === 'VA') {
      reasons.push(
        scenario.language === 'es'
          ? 'porque el pricing VA puede ser más favorable'
          : 'because VA pricing can be more favorable'
      );
    } else if (scenario.loanType === 'Conventional') {
      reasons.push(
        scenario.language === 'es'
          ? 'porque estamos usando pricing convencional'
          : 'because conventional pricing is being used'
      );
    }

    if (scenario.creditScore >= 760) {
      reasons.push(
        scenario.language === 'es'
          ? 'porque tu crédito fuerte ayudó al pricing'
          : 'because your stronger credit score helped pricing'
      );
    } else if (scenario.creditScore >= 720) {
      reasons.push(
        scenario.language === 'es'
          ? 'porque tu buen crédito ayudó al pricing'
          : 'because your good credit score helped pricing'
      );
    } else if (scenario.creditScore && scenario.creditScore < 680) {
      reasons.push(
        scenario.language === 'es'
          ? 'porque un puntaje de crédito más bajo puede subir el pricing'
          : 'because a lower credit score can increase pricing'
      );
    }

    if (scenario.loanAmount > 600000) {
      reasons.push(
        scenario.language === 'es' ? 'porque el monto del préstamo es más alto' : 'because the loan amount is higher'
      );
    }

    if (reasons.length === 0) {
      return scenario.language === 'es'
        ? 'Tu pricing está basado en el escenario actual.'
        : 'Your pricing is based on the current scenario.';
    }

    return scenario.language === 'es'
      ? `Tus tasas cambiaron ${reasons.join(', ')}.`
      : `Your rates changed ${reasons.join(', ')}.`;
  }, [scenario]);

  const rates = useMemo(() => {
    let baseRate = 6.0;

    const calculatePayment = (loanAmount, annualRate, termMonths = 360) => {
      if (!loanAmount || !annualRate) return '$0';
      const monthlyRate = annualRate / 100 / 12;
      const payment = (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));
      return `$${Math.round(payment).toLocaleString()}`;
    };

    const calcPriceDollar = (percent) => {
      if (!scenario.loanAmount) return '$0';
      const amount = Math.round((scenario.loanAmount * Math.abs(percent)) / 100);
      if (percent > 0) return `+$${amount.toLocaleString()}`;
      if (percent < 0) return `-$${amount.toLocaleString()}`;
      return '$0';
    };

    if (scenario.creditScore >= 760) baseRate -= 0.25;
    else if (scenario.creditScore >= 720) baseRate -= 0.125;
    else if (scenario.creditScore && scenario.creditScore < 680) baseRate += 0.25;

    if (scenario.loanType === 'FHA') baseRate += 0.125;
    if (scenario.loanType === 'VA') baseRate -= 0.125;

    if (scenario.loanAmount > 600000) baseRate += 0.125;

    const formatRate = (r) => `${r.toFixed(3)}%`;

    return [
      {
        rate: formatRate(baseRate + 0.5),
        type: 'Credit',
        pct: '+1.000%',
        dollars: calcPriceDollar(1.0),
        payment: calculatePayment(scenario.loanAmount, baseRate + 0.5),
      },
      {
        rate: formatRate(baseRate + 0.375),
        type: 'Credit',
        pct: '+0.750%',
        dollars: calcPriceDollar(0.75),
        payment: calculatePayment(scenario.loanAmount, baseRate + 0.375),
      },
      {
        rate: formatRate(baseRate + 0.25),
        type: 'Credit',
        pct: '+0.500%',
        dollars: calcPriceDollar(0.5),
        payment: calculatePayment(scenario.loanAmount, baseRate + 0.25),
      },
      {
        rate: formatRate(baseRate + 0.125),
        type: 'Credit',
        pct: '+0.375%',
        dollars: calcPriceDollar(0.375),
        payment: calculatePayment(scenario.loanAmount, baseRate + 0.125),
      },
      {
        rate: formatRate(baseRate),
        type: 'Par',
        pct: '0.000%',
        dollars: '$0',
        payment: calculatePayment(scenario.loanAmount, baseRate),
      },
      {
        rate: formatRate(baseRate - 0.125),
        type: 'Cost',
        pct: '-0.375%',
        dollars: calcPriceDollar(-0.375),
        payment: calculatePayment(scenario.loanAmount, baseRate - 0.125),
      },
      {
        rate: formatRate(baseRate - 0.25),
        type: 'Cost',
        pct: '-0.750%',
        dollars: calcPriceDollar(-0.75),
        payment: calculatePayment(scenario.loanAmount, baseRate - 0.25),
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
      <div style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

      <div style={{ textAlign: 'center', marginBottom: 30, marginTop: 8 }}>
        <div style={{ fontSize: 64, fontWeight: 800, color: '#ffffff', letterSpacing: 2 }}>
          CHOOSE MY RATE
        </div>
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      <div style={{ maxWidth: 1380, margin: '0 auto', padding: '0 28px' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
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
            <div style={{ fontSize: 30, fontWeight: 700, marginBottom: 18 }}>Choose Your Rate</div>
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
                  {...row}
                  highlight={row.rate === selectedRate}
                  onClick={() => setSelectedRate(row.rate)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScenarioField({ label, value }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 16,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 12, color: '#a9b6cc', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function RateRow({ rate, type, pct, dollars, payment, highlight = false, onClick }) {
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