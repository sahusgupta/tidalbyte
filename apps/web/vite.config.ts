import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const require = createRequire(import.meta.url);
const cesiumRoot = dirname(require.resolve("cesium/package.json"));
const cesiumBuildRoot = resolve(cesiumRoot, "Build/Cesium");

export default defineConfig({
  envDir: "../..",
  plugins: [
    react(),
    tailwindcss(),
    viteStaticCopy({
      targets: ["Workers", "ThirdParty", "Assets", "Widgets"].map((folder) => ({
        src: normalizePath(resolve(cesiumBuildRoot, folder)),
        dest: "cesium",
        // Static-copy v4 preserves source directories. Remove pnpm's dependency
        // path, then retain the Assets/Workers/... hierarchy Cesium requests.
        rename: (_name, _extension, fullPath) => ({
          stripBase: true,
          name: normalizePath(relative(cesiumBuildRoot, fullPath)),
        }),
      })),
    }),
  ],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
});
