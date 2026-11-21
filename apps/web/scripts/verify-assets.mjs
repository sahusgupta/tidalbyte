import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Check the built artifact, since preserved dependency paths can make Vite's
// index fallback conceal missing Cesium assets behind a successful HTTP 200.
const asset = (path) => new URL(`../dist/cesium/${path}`, import.meta.url);
const tileMap = await readFile(asset("Assets/Textures/NaturalEarthII/tilemapresource.xml"), "utf8");
assert.match(tileMap, /<TileMap\s/);
const heights = JSON.parse(await readFile(asset("Assets/approximateTerrainHeights.json"), "utf8"));
assert.ok(Object.keys(heights).length > 0);
const worker = await readFile(asset("Workers/createGeometry.js"), "utf8");
assert.ok(worker.length > 0);
console.log("Verified bundled Cesium imagery, terrain metadata and workers.");
