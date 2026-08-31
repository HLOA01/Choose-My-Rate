# Sally OpenAI Integration Notes

## Recommended Architecture
Frontend chat input
-> AWS API Gateway
-> Lambda
-> OpenAI
-> structured response
-> SallyBrain fallback / scenario merge
-> UI update

## Recommended First Phase
Use OpenAI for:
- intent understanding
- structured extraction
- next-question generation
- tone and response quality

Keep local app logic for:
- scenario state
- pricing calculations
- UI control
- fallback rules

## Suggested Structured Output
Return JSON like:
{
  "reply": "string",
  "language": "en",
  "intent": "purchase|refinance|cash_out|reset|other",
  "fields": {
    "loanPurpose": "",
    "occupancy": "",
    "purchasePrice": "",
    "downPayment": "",
    "loanAmount": "",
    "creditScore": "",
    "loanType": "",
    "zipCode": ""
  },
  "nextQuestion": "string",
  "confidence": 0.0
}

## Fallback Rule
If OpenAI fails or confidence is too low:
- use SallyBrain.js rule-based handling

## Practical Goal
Make Sally smarter without losing control.
