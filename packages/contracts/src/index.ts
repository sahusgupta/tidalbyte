export type * from './generated';
import type { FeatureCollection, Polygon } from 'geojson';
import type { ApiError, Evaluation, ResponseMeta, Scenario } from './generated';
import scenario from '../../../contracts/example-scenario.json';
import evaluation from '../../../data/fixtures/offline-evaluation.json';
import counties from './counties.generated.json';

export type Envelope<T> =
  | { data: T; meta: ResponseMeta; error: null }
  | { data: null; meta: ResponseMeta; error: ApiError };
export interface CountyProperties {
  countyFips: string;
  name: string;
  sourceId: string;
  geometryKind: 'schematic';
  severityBucket: number;
}
export const offlineScenario = scenario as Scenario;
export const offlineEvaluation = evaluation as Evaluation;
export const offlineCounties = counties as FeatureCollection<Polygon, CountyProperties>;
