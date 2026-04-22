# Choose My Rate

React/Vite mortgage scenario and pricing app.

## Local Setup

```bash
npm install
npm run dev
```

Production check:

```bash
npm run lint
npm run build
```

## Deploy From AWS Amplify

This repo includes `amplify.yml`, so AWS Amplify Hosting can build and publish the app directly from the repository.

1. Push this project to GitHub, GitLab, Bitbucket, or AWS CodeCommit.
2. In the AWS Console, open **AWS Amplify**.
3. Choose **Create new app** then **Host web app**.
4. Connect the repository and select the branch you want deployed.
5. Keep the detected build settings. They should match:

```yaml
preBuild:
  commands:
    - npm ci
build:
  commands:
    - npm run build
artifacts:
  baseDirectory: dist
```

6. Deploy the app.

Amplify will serve the `dist` folder after every successful build.

## Environment Variables

Do not add private API keys, including `OPENAI_API_KEY`, to Vite environment variables because they are bundled into browser code.

The browser calls the public Sally API endpoint through:

```bash
VITE_SALLY_API_URL=https://aspy7gkhu0.execute-api.us-east-1.amazonaws.com
```

Sally voice playback uses a separate secure Polly endpoint:

```bash
VITE_SALLY_VOICE_API_URL=https://your-sally-voice-endpoint.execute-api.us-east-1.amazonaws.com
```

That endpoint is backed by AWS Lambda. Add the OpenAI key to Lambda, not to the frontend:

```bash
aws lambda update-function-configuration \
  --profile choose-my-rate \
  --region us-east-1 \
  --function-name choose-my-rate-sally-openai \
  --environment "Variables={OPENAI_API_KEY=your_openai_api_key,OPENAI_MODEL=gpt-4o-mini,ALLOWED_ORIGIN=*}"
```

After that, Sally will use OpenAI for chat responses. Without the key, the frontend falls back to the local rule-based Sally brain.

## Sally Voice With AWS Polly

Sally voice is implemented as a separate server-side Polly Lambda so AWS credentials never touch the browser.

Frontend files:

- [src/services/voice/voiceConfig.js](./src/services/voice/voiceConfig.js)
- [src/services/voice/sallyVoiceClient.js](./src/services/voice/sallyVoiceClient.js)
- [src/hooks/useSallyVoice.js](./src/hooks/useSallyVoice.js)

Backend files:

- [lambda/polly-sally.mjs](./lambda/polly-sally.mjs)
- [lambda/polly-voice-config.mjs](./lambda/polly-voice-config.mjs)
- [lambda/package.json](./lambda/package.json)

Default Polly settings:

- `VoiceId=Joanna`
- `Engine=neural`
- `LanguageCode=en-US`
- `OutputFormat=mp3`

### Voice Lambda Environment

The Polly Lambda uses standard AWS credential resolution from the Lambda execution role. Do not hardcode access keys.

Optional environment variables:

```bash
ALLOWED_ORIGIN=https://main.d2nl4867hj2316.amplifyapp.com
POLLY_VOICE_ID=Joanna
POLLY_ENGINE=neural
POLLY_LANGUAGE_CODE=en-US
POLLY_OUTPUT_FORMAT=mp3
POLLY_SPEAKING_RATE=96%
POLLY_SENTENCE_BREAK_MS=280
POLLY_CLAUSE_BREAK_MS=170
POLLY_MAX_TEXT_LENGTH=2400
```

### Deploying The Polly Lambda

Install the Lambda dependency inside the `lambda` folder before packaging:

```bash
cd lambda
npm install
```

Then package the Lambda folder contents and deploy `polly-sally.mjs` as the handler module for a new function such as `choose-my-rate-sally-voice`. Expose it through API Gateway with `POST` and `OPTIONS` enabled.

### Local Run Notes

For the frontend:

```bash
npm install
npm run dev
```

For local Polly testing, point `VITE_SALLY_VOICE_API_URL` to your deployed voice endpoint or to a local server that proxies to the Lambda handler.
