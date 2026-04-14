export async function generateCode() {
  throw new Error(
    "OpenAI calls need a server-side AWS Lambda or API route so API keys are never shipped to the browser."
  );
}

export default null;
