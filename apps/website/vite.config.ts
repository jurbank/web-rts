import { createReadStream, existsSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite-plus";

/**
 * In development, a model not yet approved into `public/models` is served from
 * the art pipeline's staging exports, so the game can try it before approval.
 */
function stagedModels(): Plugin {
  const publicModels = new URL("public/models/", import.meta.url).pathname;
  const staging = new URL("../../art/staging/models/", import.meta.url).pathname;
  return {
    name: "staged-models",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/models/", (request, response, next) => {
        const path = decodeURIComponent((request.url ?? "").split("?")[0]).replace(/^\/+/, "");
        const staged = staging + path;
        if (path.includes("..") || existsSync(publicModels + path) || !existsSync(staged)) {
          next();
          return;
        }
        response.setHeader("Content-Type", "model/gltf-binary");
        createReadStream(staged).pipe(response);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), stagedModels()],
});
