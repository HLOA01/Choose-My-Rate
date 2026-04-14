const SALLY_API_URL = import.meta.env.VITE_SALLY_API_URL || "";

export function hasSallyApi() {
  return Boolean(SALLY_API_URL);
}

export async function askSallyApi({ message, scenario, localResult }) {
  if (!SALLY_API_URL) {
    throw new Error("VITE_SALLY_API_URL is not set");
  }

  const response = await fetch(SALLY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      scenario,
      localResult,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sally API failed with ${response.status}`);
  }

  return response.json();
}
