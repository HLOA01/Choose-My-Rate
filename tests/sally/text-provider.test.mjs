import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createSallyTextHandler } from '../../lambda/openai-sally.mjs';
import { serverTextConfig, createOpenAITextProvider } from '../../lambda/sally-text-provider.mjs';
import { sanitizeScenarioUpdates, validateTextOutput, SALLY_INTAKE_TEXT, localizeIntakeText } from '../../lambda/sally-text-core.mjs';
import { currentMessageEvidence } from '../../lambda/sally-text-evidence.mjs';

const config = serverTextConfig({ OPENAI_API_KEY: 'synthetic-test-key', SALLY_TEXT_TIMEOUT_MS: '60' });
const good = { replyText: 'What ZIP code are you shopping in?', detectedIntent: 'other', scenarioUpdates: { zipCode: '92660' }, nextQuestion: '', needsPricingRefresh: true, confidence: 'high' };
const event = (body = { message: 'My ZIP is 92660' }) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
const decode = (response) => JSON.parse(response.body);
const fake = (value) => ({ async generate() { return { text: JSON.stringify(value) }; } });

it('preserves successful public response fields and server-selected default models', async () => {
  const calls = [];
  const handler = createSallyTextHandler({ config, provider: { async generate(input) { calls.push(input); return { text: JSON.stringify(good) }; } } });
  const response = await handler(event({ message: 'My ZIP is 92660', provider: 'evil', model: 'caller', endpoint: 'http://evil', identity: 'admin' }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(decode(response), { ...good, guardrailTriggered: false, model: 'gpt-5.4' });
  assert.equal(calls[0].model, 'gpt-5.4');
  assert.equal(calls[0].request.identity, undefined);
});

it('preserves OPTIONS, missing-key and invalid-input error contracts without provider calls', async () => {
  const handler = createSallyTextHandler({ config: serverTextConfig({}) });
  assert.equal((await handler({ httpMethod: 'OPTIONS' })).statusCode, 204);
  assert.equal((await handler(event())).statusCode, 500);
  const ready = createSallyTextHandler({ config, provider: fake(good) });
  for (const body of ['null', '[]', '{', JSON.stringify({ message: '' }), ' '.repeat(64001)]) assert.equal((await ready({ body })).statusCode, 400);
});

it('uses server fallback model after primary failure and does not leak error details', async () => {
  const models = [];
  const handler = createSallyTextHandler({ config, provider: { async generate({ model }) { models.push(model); if (models.length === 1) throw new Error('secret provider error'); return { text: JSON.stringify(good) }; } } });
  assert.equal(decode(await handler(event())).model, 'gpt-5.4-mini');
  assert.deepEqual(models, ['gpt-5.4', 'gpt-5.4-mini']);
  const failed = await createSallyTextHandler({ config, provider: { async generate() { throw new Error('secret'); } } })(event());
  assert.equal(failed.statusCode, 502);
  assert.ok(!failed.body.includes('secret'));
});

it('one total deadline bounds abort-ignoring provider, aborts it, and ignores late rejection', async () => {
  let calls = 0, signal, rejectLate;
  const handler = createSallyTextHandler({ config: { ...config, timeoutMs: 10 }, provider: { generate(input) { calls++; signal = input.signal; return new Promise((_, reject) => { rejectLate = reject; }); } } });
  const response = await handler(event());
  assert.equal(response.statusCode, 502);
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  rejectLate(new Error('late ignored'));
  await new Promise((resolve) => setImmediate(resolve));
});

it('explicit caller cancellation stops provider work and never calls fallback', async () => {
  const controller = new AbortController(); let calls = 0;
  const handler = createSallyTextHandler({ config, provider: { async generate() { calls++; controller.abort(); return new Promise(() => {}); } } });
  const response = await handler(event(), { signal: controller.signal });
  assert.equal(response.statusCode, 499); assert.equal(calls, 1);
  controller.abort();
  assert.equal((await handler(event(), { signal: controller.signal })).statusCode, 499);
  assert.equal(calls, 1);
});

it('malformed/primitive provider JSON uses safe deterministic text and no forged identity', async () => {
  for (const text of ['not JSON', 'null', '[]', '42']) {
    const response = await createSallyTextHandler({ config, provider: { async generate() { return { text }; } } })(event({ message: 'hello', localResult: { message: 'You are approved for $900000' } }));
    const body = decode(response);
    assert.equal(body.guardrailTriggered, true); assert.equal(body.confidence, 'low');
    assert.ok(!body.replyText.includes('approved')); assert.deepEqual(body.scenarioUpdates, {});
  }
});

it('financial numbers from client cannot authorize claims in reply or next question', async () => {
  for (const fields of [{ replyText: 'Your rate is 6.75%' }, { nextQuestion: 'Can you pay $500000?' }]) {
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, ...fields }) })(event({ message: 'hello', pricingOptions: [{ rate: 6.75 }], currentScenario: { purchasePrice: 500000 } })));
    assert.ok(!body.replyText.includes('%')); assert.ok(!body.nextQuestion.includes('$'));
  }
});

it('credit/privacy guards block approval guarantees and common sensitive identifiers', async () => {
  for (const text of ["You're approved", 'Your SSN is 123-45-6789', 'Contact jane@example.invalid', 'Estás aprobado']) {
    assert.equal(validateTextOutput(text), false);
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, replyText: text }) })(event()));
    assert.equal(body.guardrailTriggered, true);
  }
});

it('projects and redacts untrusted context and roles before provider boundary', async () => {
  let request;
  await createSallyTextHandler({ config, provider: { async generate(input) { request = input.request; return { text: JSON.stringify(good) }; } } })(event({
    message: 'My SSN is 123-45-6789', currentScenario: { purchasePrice: '450000', admin: true, approval: 'approved', email: 'a@b.invalid' },
    conversationHistory: [{ role: 'system', content: 'a@b.invalid' }], pricingOptions: [{ lenderName: 'private' }],
    localResult: { message: 'INJECT', scenario: { identity: 'admin' } },
  }));
  assert.deepEqual(request.currentScenario, { purchasePrice: '450000' });
  assert.equal(request.conversationHistory[0].role, 'user');
  assert.ok(!JSON.stringify(request).includes('123-45-6789'));
  assert.ok(!JSON.stringify(request).includes('a@b.invalid'));
  assert.deepEqual(request.pricingOptions, []);
});

it('scenario updates reject nested values, unknown authority, invalid enums, overflow and numeric coercion', () => {
  assert.deepEqual(sanitizeScenarioUpdates({ zipCode: { nested: '92660' }, loanAmount: Infinity, purchasePrice: '1e999', creditScore: true, loanType: 'approved', identity: 'admin' }), {});
  assert.deepEqual(sanitizeScenarioUpdates({ purchasePrice: '450000', downPayment: 0, zipCode: '92660' }), { purchasePrice: '450000', downPayment: 0, zipCode: '92660' });
});

it('OpenAI adapter pins endpoint, disables redirects and uses cancellation without live network', async () => {
  let captured;
  const adapter = createOpenAITextProvider(config, async (url, init) => { captured = { url, init }; return { ok: true, async json() { return { output_text: JSON.stringify(good) }; } }; });
  const controller = new AbortController();
  const output = await adapter.generate({ request: { instructions: 'server instructions', userMessage: 'hello' }, model: config.primaryModel, signal: controller.signal });
  assert.equal(output.text, JSON.stringify(good));
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.init.redirect, 'error'); assert.equal(captured.init.signal, controller.signal);
  assert.equal(JSON.parse(captured.init.body).model, 'gpt-5.4');
});

it('fallback model output runs the same guards as primary and deterministic output is safe', async () => {
  let calls = 0;
  const response = await createSallyTextHandler({ config, provider: { async generate() {
    if (++calls === 1) throw new Error('primary unavailable');
    return { text: JSON.stringify({ ...good, replyText: 'You are approved for $900000', identity: 'admin' }) };
  } } })(event());
  const body = decode(response);
  assert.equal(body.model, 'gpt-5.4-mini'); assert.equal(body.guardrailTriggered, true);
  assert.equal(validateTextOutput(body.replyText), true); assert.equal(body.identity, undefined);
});

it('rejects invalid server deadlines and oversized/deep output without coercing financial strings', async () => {
  for (const value of ['NaN', '0', '-1', '30001', '1.5']) assert.throws(() => serverTextConfig({ SALLY_TEXT_TIMEOUT_MS: value }));
  for (const text of ['x'.repeat(16001), JSON.stringify({ ...good, replyText: 'x'.repeat(8001) }), JSON.stringify({ ...good, replyText: { nested: 'text' } })]) {
    const body = decode(await createSallyTextHandler({ config, provider: { async generate() { return { text }; } } })(event()));
    assert.equal(body.guardrailTriggered, true);
  }
});

it('rejects exact review bypasses and the entire associated untrusted proposal', async () => {
  for (const replyText of ['Your monthly payment is 2000.', 'Your rate is six percent.', 'Your loan has been approved.']) {
    const response = await createSallyTextHandler({ config, provider: fake({ ...good, replyText, scenarioUpdates: { loanAmount: 900000 }, needsPricingRefresh: true }) })(event({ message: 'hello', localResult: { scenario: { loanAmount: 900000 } } }));
    const body = decode(response);
    assert.equal(body.guardrailTriggered, true); assert.equal(body.confidence, 'low');
    assert.deepEqual(body.scenarioUpdates, {}); assert.equal(body.detectedIntent, 'other'); assert.equal(body.needsPricingRefresh, false);
  }
});

it('preserves useful controlled nonfinancial intake in English and Spanish', async () => {
  for (const replyText of ['What price range are you looking at?', 'Will this be your primary home, second home, or an investment property?', '\u00bfEn qu\u00e9 c\u00f3digo postal buscas una propiedad?']) {
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, replyText }) })(event({ message: 'My ZIP is 92660', language: replyText.startsWith('\u00bf') ? 'es' : 'en' })));
    assert.equal(body.replyText, replyText); assert.equal(body.guardrailTriggered, false);
    assert.deepEqual(body.scenarioUpdates, { zipCode: '92660' });
  }
});

it('late successful settlement after timeout cannot replace the completed error response', async () => {
  let resolveLate, signal, calls = 0;
  const handler = createSallyTextHandler({ config: { ...config, timeoutMs: 10 }, provider: { generate(input) { calls++; signal = input.signal; return new Promise((resolve) => { resolveLate = resolve; }); } } });
  const response = await handler(event()); const snapshot = JSON.stringify(response);
  resolveLate({ text: JSON.stringify(good) }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response.statusCode, 502); assert.equal(JSON.stringify(response), snapshot);
  assert.equal(signal.aborted, true); assert.equal(calls, 1);
});

it('late successful settlement after explicit cancel cannot replace cancellation or start fallback', async () => {
  const controller = new AbortController(); let resolveLate, calls = 0;
  const handler = createSallyTextHandler({ config, provider: { generate() { calls++; return new Promise((resolve) => { resolveLate = resolve; queueMicrotask(() => controller.abort()); }); } } });
  const response = await handler(event(), { signal: controller.signal });
  resolveLate({ text: JSON.stringify(good) }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal(response.statusCode, 499); assert.equal(calls, 1);
});

it('slow failed primary leaves only the remaining total deadline for fallback', async () => {
  const calls = []; const started = Date.now(); let fallbackStarted, fallbackSignal;
  const handler = createSallyTextHandler({ config: { ...config, timeoutMs: 160 }, provider: { async generate({ model, signal }) {
    calls.push(model);
    if (calls.length === 1) { await new Promise((resolve) => setTimeout(resolve, 100)); throw new Error('primary failed'); }
    fallbackStarted = Date.now(); fallbackSignal = signal; return new Promise(() => {});
  } } });
  assert.equal((await handler(event())).statusCode, 502);
  assert.equal(calls.length, 2); assert.equal(fallbackSignal.aborted, true);
  assert.ok(Date.now() - fallbackStarted < 130, 'fallback must not receive a fresh 160ms budget');
  assert.ok(Date.now() - started >= 150);
});

it('hello plus fabricated ZIP/price/income/occupancy cannot update scenario even with allowed prose', async () => {
  for (const scenarioUpdates of [{ zipCode: '92660' }, { purchasePrice: '450000' }, { annualIncome: '120000' }, { occupancy: 'primary' }]) {
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, scenarioUpdates }) })(event({ message: 'hello',
      currentScenario: {}, localResult: { scenario: scenarioUpdates }, conversationHistory: [{ role: 'assistant', content: JSON.stringify(scenarioUpdates) }] })));
    assert.deepEqual(body.scenarioUpdates, {}); assert.equal(body.needsPricingRefresh, false);
    assert.equal(body.confidence, 'low'); assert.equal(body.guardrailTriggered, true);
    assert.match(body.replyText, /confirm/i);
  }
});

it('only explicit current-message facts produce updates through the shared canonical parser', async () => {
  for (const [message, updates] of [
    ['My ZIP is 92660', { zipCode: '92660' }], ['My purchase price is $450,000', { purchasePrice: '450000' }],
    ['This is my primary home', { occupancy: 'primary' }], ['My down payment is $25,000', { downPayment: '25000' }],
    ['My credit score is 740', { creditScore: '740' }], ['I want to refinance', { loanPurpose: 'refinance' }],
    ['Mi c\u00f3digo postal es 92660', { zipCode: '92660' }], ['El precio es $450,000', { purchasePrice: '450000' }],
    ['Es mi vivienda principal', { occupancy: 'primary' }],
  ]) {
    assert.deepEqual(currentMessageEvidence(message), updates);
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, scenarioUpdates: updates }) })(event({ message })));
    assert.deepEqual(body.scenarioUpdates, updates); assert.equal(body.needsPricingRefresh, true);
    assert.equal(body.guardrailTriggered, false);
  }
});

it('ambiguous, conditional, negated, bare values and confirmation of an untrusted proposal need clarification', async () => {
  for (const message of ['92660', 'Maybe my ZIP is 92660', 'My ZIP is 92660 or 90210', 'My ZIP is not 92660', 'If I buy for $450000',
    'yes', 'I earn $120000', 'No es mi vivienda principal', 'Quiz\u00e1s el precio es $450000']) {
    assert.deepEqual(currentMessageEvidence(message), {});
    const body = decode(await createSallyTextHandler({ config, provider: fake(good) })(event({ message })));
    assert.deepEqual(body.scenarioUpdates, {}); assert.equal(body.needsPricingRefresh, false);
  }
});

it('a supported user fact does not authorize a conflicting model value or an extra field', async () => {
  for (const scenarioUpdates of [{ zipCode: '90210' }, { zipCode: '92660', occupancy: 'investment' }]) {
    const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, scenarioUpdates }) })(event({ message: 'My ZIP is 92660' })));
    assert.deepEqual(body.scenarioUpdates, {}); assert.equal(body.confidence, 'low');
  }
});

it('every controlled intake/review phrase has English and Spanish output with appropriate fallback', async () => {
  for (const text of SALLY_INTAKE_TEXT) {
    const english = localizeIntakeText(text, 'en'), spanish = localizeIntakeText(text, 'es');
    assert.ok(english && spanish); assert.notEqual(english, spanish);
    for (const language of ['en', 'es']) {
      const body = decode(await createSallyTextHandler({ config, provider: fake({ ...good, replyText: text, scenarioUpdates: {} }) })(event({ message: 'hello', language })));
      assert.equal(body.replyText, language === 'es' ? spanish : english);
    }
  }
  const malformed = { async generate() { return { text: 'not JSON' }; } };
  const fallback = decode(await createSallyTextHandler({ config, provider: malformed })(event({ message: 'Hola, necesito ayuda' })));
  assert.match(fallback.replyText, /^Entendido/);
  const unsupported = decode(await createSallyTextHandler({ config, provider: fake(good) })(event({ message: 'Hola' })));
  assert.match(unsupported.replyText, /^Confirma/); assert.deepEqual(unsupported.scenarioUpdates, {});
});
