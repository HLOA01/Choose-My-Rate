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

That endpoint is backed by AWS Lambda. Add the OpenAI key to Lambda, not to the frontend:

```bash
aws lambda update-function-configuration \
  --profile choose-my-rate \
  --region us-east-1 \
  --function-name choose-my-rate-sally-openai \
  --environment "Variables={OPENAI_API_KEY=your_openai_api_key,OPENAI_MODEL=gpt-4o-mini,ALLOWED_ORIGIN=*}"
```

After that, Sally will use OpenAI for chat responses. Without the key, the frontend falls back to the local rule-based Sally brain.
