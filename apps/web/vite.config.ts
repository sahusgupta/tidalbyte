import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const require = createRequire(import.meta.url);
const cesiumRoot = dirname(require.resolve("cesium/package.json"));

export default defineConfig({
  envDir: "../..",
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((folder) => ({
        src: normalizePath(resolve(cesiumRoot, "Build/Cesium", folder)),
        dest: "cesium",
      })),
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
