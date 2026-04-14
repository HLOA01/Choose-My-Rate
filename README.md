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

This is currently a frontend-only app. Do not add private API keys, including `OPENAI_API_KEY`, to Vite environment variables because they are bundled into browser code.

If Sally needs live AI responses later, use an AWS Lambda behind API Gateway and store the private key in AWS Secrets Manager or Lambda environment variables. The frontend should call that Lambda endpoint instead of calling OpenAI directly.
