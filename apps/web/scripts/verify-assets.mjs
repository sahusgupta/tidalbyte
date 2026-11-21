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
const widgetCss = await readFile(asset("Widgets/CesiumWidget/CesiumWidget.css"), "utf8");
assert.ok(widgetCss.length > 0);
const creditImage = await readFile(asset("Assets/Images/cesium_credit.png"));
assert.ok(creditImage.length > 0);
const mapFile = (name) => new URL(`../dist/map/${name}`, import.meta.url);
const aerial = JSON.parse(await readFile(mapFile("provenance.json"), "utf8"));
assert.equal(aerial.assets.length, 2);
for (const tile of aerial.assets) {
  const bytes = await readFile(mapFile(tile.file));
  assert.equal(bytes.length, tile.bytes);
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(tile.bboxWgs84.length, 4);
}
console.log("Verified Cesium runtime assets, Houston aerial imagery and map provenance.");
