import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function loadLambdaEnv() {
  try {
    const envText = readFileSync("lambda/.env", "utf8");

    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1 && line.startsWith("sk-") && !process.env.OPENAI_API_KEY) {
        process.env.OPENAI_API_KEY = line;
        continue;
      }

      if (separatorIndex === -1) continue;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Local API routes can still run if env vars are already present in the shell.
  }
}

function createLambdaRoutePlugin() {
  const routeMap = new Map([
    [
      "/api/sally-brain",
      {
        file: pathToFileURL(resolve(process.cwd(), "lambda/openai-sally.mjs")).href,
        methods: new Set(["POST", "OPTIONS"]),
      },
    ],
    [
      "/api/sally-brain-stream",
      {
        file: pathToFileURL(resolve(process.cwd(), "lambda/openai-sally-stream.mjs")).href,
        methods: new Set(["POST", "OPTIONS"]),
      },
    ],
    [
      "/api/sally-voice",
      {
        file: pathToFileURL(resolve(process.cwd(), "lambda/openai-voice.mjs")).href,
        methods: new Set(["POST", "OPTIONS"]),
      },
    ],
    [
      "/api/sally-realtime-session",
      {
        file: pathToFileURL(resolve(process.cwd(), "lambda/realtime-session.mjs")).href,
        methods: new Set(["GET", "OPTIONS"]),
      },
    ],
    [
      "/api/test-openai",
      {
        file: pathToFileURL(resolve(process.cwd(), "lambda/test-openai.mjs")).href,
        methods: new Set(["GET", "OPTIONS"]),
      },
    ],
  ]);

  return {
    name: "local-lambda-routes",
    configureServer(server) {
      loadLambdaEnv();

      server.middlewares.use(async (req, res, next) => {
        const route = routeMap.get(req.url?.split("?")[0] || "");
        if (!route) {
          next();
          return;
        }

        const method = req.method || "GET";
        if (!route.methods.has(method)) {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ message: "Method not allowed." }));
          return;
        }

        try {
          const bodyBuffer = await new Promise((resolve, reject) => {
            const chunks = [];
            req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            req.on("end", () => resolve(Buffer.concat(chunks)));
            req.on("error", reject);
          });

          const event = {
            httpMethod: method,
            headers: req.headers,
            isBase64Encoded: false,
            body: bodyBuffer.length ? bodyBuffer.toString("utf8") : "",
            requestContext: {
              http: {
                method,
                path: req.url?.split("?")[0] || "",
              },
            },
          };

          const lambdaModule = await import(route.file);
          if (typeof lambdaModule.streamHandler === "function") {
            await lambdaModule.streamHandler(event, res);
            return;
          }

          const { handler } = lambdaModule;

          const result = await handler(event);
          res.statusCode = result?.statusCode || 200;

          for (const [key, value] of Object.entries(result?.headers || {})) {
            if (value !== undefined) {
              res.setHeader(key, value);
            }
          }

          if (result?.isBase64Encoded) {
            res.end(Buffer.from(result.body || "", "base64"));
            return;
          }

          res.end(result?.body || "");
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              message: error instanceof Error ? error.message : "Local API route failed.",
            }),
          );
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), createLambdaRoutePlugin()],
  cacheDir: resolve(tmpdir(), "choose-my-rate-vite-cache"),
  resolve: {
    preserveSymlinks: true,
  },
  build: {
    assetsDir: "",
  },
});
