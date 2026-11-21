// Generated from contracts/*.schema.json. Run pnpm contracts:generate. Do not edit.

export interface EarthLabContracts {
  scenario?: Scenario;
  commandProposal?: CommandProposal;
  featureSpec?: FeatureSpec;
  evaluationMetrics?: EvaluationMetrics;
  modelMetadata?: ModelMetadata;
  prediction?: Prediction;
  evaluation?: Evaluation;
  responseMeta?: ResponseMeta;
  apiError?: ApiError;
  intervention?: Intervention;
  connectivityMetrics?: ConnectivityMetrics;
  planComparison?: PlanComparison;
  networkCompareRequest?: NetworkCompareRequest;
  interpretRequest?: InterpretRequest;
  interpretation?: Interpretation;
  voiceSpeakRequest?: VoiceSpeakRequest;
}
export interface Scenario {
  id: string;
  regionId: 'houston-gulf-coast';
  presetEventId: string;
  scenarioVersion: number;
  selection: ScenarioSelection;
  modelMode: 'historical_context' | 'exploratory_what_if';
  perturbations?: {
    [k: string]: number;
  };
}
export interface ScenarioSelection {
  /**
   * @minItems 1
   * @maxItems 50
   */
  countyFips: string[];
  /**
   * @minItems 1
   * @maxItems 10
   */
  warningTypes: string[];
  eventTimeUtc: string;
}
export interface CommandProposal {
  commandId: string;
  scenarioVersion: number;
  action:
    | 'SELECT_REGION'
    | 'SELECT_PRESET'
    | 'SET_PARAMETER'
    | 'RUN_ANALYSIS'
    | 'TOGGLE_OVERLAY'
    | 'COMPARE_INTERVENTION'
    | 'EXPLAIN_RESULT';
  args: {
    [k: string]: unknown;
  };
  requiresConfirmation: boolean;
  clarification?: string;
}
export interface FeatureSpec {
  name: string;
  unit: string;
  min: number;
  max: number;
}
export interface EvaluationMetrics {
  splitPolicy: string;
  baselineName: string;
  baselineMae: number;
  modelMae: number;
  targetUnit: string;
  trainEventCount: number;
  testEventCount: number;
}
export interface ModelMetadata {
  modelVersion: string;
  dataMode: 'trained_conditional' | 'offline_example';
  status: 'not_trained' | 'trained';
  target: string;
  severityUnit: string;
  scope: 'selected_positive_outage_warning_hours';
  /**
   * @minItems 0
   * @maxItems 16
   */
  featureSchema: FeatureSpec[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  trainingDatasetIds: string[];
  evaluation: EvaluationMetrics | null;
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: string[];
}
export interface Prediction {
  countyFips: string;
  predictedSeverity: number;
  severityUnit: string;
  modelVersion: string;
  dataMode: 'trained_conditional' | 'offline_example';
  scope: 'selected_positive_outage_warning_hours';
  baselineSeverity?: number;
  /**
   * @minItems 1
   * @maxItems 30
   */
  notes: string[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  sourceIds: string[];
}
export interface Evaluation {
  scenario: Scenario;
  /**
   * @minItems 1
   * @maxItems 50
   */
  predictions: Prediction[];
  modelMetadata: ModelMetadata;
  /**
   * @minItems 1
   * @maxItems 30
   */
  disclaimers: string[];
}
export interface ResponseMeta {
  requestId: string;
  mode: 'historical_context' | 'exploratory_what_if' | 'offline_example';
  /**
   * @minItems 0
   * @maxItems 30
   */
  sourceIds: string[];
  /**
   * @minItems 0
   * @maxItems 30
   */
  warnings: string[];
}
export interface ApiError {
  code: string;
  message: string;
  details?: unknown[];
}
export interface Intervention {
  id: string;
  /**
   * @minItems 0
   * @maxItems 3
   */
  graphEdgeIds: string[];
  /**
   * @minItems 0
   * @maxItems 3
   */
  graphNodeIds: string[];
  action: 'protect' | 'disable' | 'inspect';
  budgetUnits?: number;
}
export interface ConnectivityMetrics {
  reachableFacilities: number;
  connectedComponents: number;
  weightedAccessScore: number;
}
export interface PlanComparison {
  baseline: ConnectivityMetrics;
  proposal: ConnectivityMetrics;
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: string[];
  graphSource: string;
  mode: 'hypothetical_connectivity';
}
export interface NetworkCompareRequest {
  regionId: 'houston-gulf-coast';
  /**
   * @minItems 0
   * @maxItems 100
   */
  disabledNodeIds: string[];
  /**
   * @minItems 0
   * @maxItems 100
   */
  disabledEdgeIds: string[];
  /**
   * @minItems 0
   * @maxItems 3
   */
  interventions: Intervention[];
}
export interface InterpretRequest {
  text: string;
  scenarioSummary: Scenario;
}
export interface Interpretation {
  proposal: CommandProposal | null;
  /**
   * @minItems 0
   * @maxItems 10
   */
  clarifications: string[];
}
export interface VoiceSpeakRequest {
  text: string;
}
