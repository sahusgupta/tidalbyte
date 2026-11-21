// Generated from contracts/*.schema.json. Run pnpm contracts:generate. Do not edit.

export interface EarthLabContracts {
  allocationRequest?: AllocationRequest;
  allocationResult?: AllocationResult;
  allocationEvaluation?: AllocationEvaluation;
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
export interface AllocationRequest {
  regionId: 'houston-gulf-coast';
  phase: 'mitigation' | 'response';
  crewCapacity: number;
  agencies: AllocationAgencies;
  scenarioVersion: 1;
  totalBudget: number;
  equipmentCapacity: number;
  horizonHours: number;
  /**
   * @minItems 0
   * @maxItems 5
   */
  blockedEdgeIds: string[];
  /**
   * @minItems 0
   * @maxItems 5
   */
  impairedEdgeIds: string[];
  bargainingWeight: number;
  effectPercent: number;
  footprint: AllocationFootprint | null;
}
export interface AllocationAgencies {
  health: AllocationAgency;
  shelter: AllocationAgency;
}
export interface AllocationAgency {
  budget: number;
  clinicWeight: number;
  shelterWeight: number;
  crewCapacity: number;
}
export interface AllocationFootprint {
  longitude: number;
  latitude: number;
  radiusKm: number;
}
export interface AllocationResult {
  regionId: 'houston-gulf-coast';
  graphSource: string;
  phase: 'mitigation' | 'response';
  scenarioLabel: string;
  /**
   * @minItems 1
   * @maxItems 24
   */
  assumptions: string[];
  scenarioVersion: 1;
  graphVersion: string;
  assumptionSetId: string;
  dataMode: 'illustrative';
  /**
   * @minItems 1
   * @maxItems 20
   */
  sourceIds: string[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: string[];
  timestampUtc: string;
  /**
   * @minItems 0
   * @maxItems 20
   */
  candidates: AllocationCandidate[];
  baselineAccess: AllocationAccess;
  /**
   * @minItems 3
   * @maxItems 3
   */
  strategies: AllocationStrategy[];
  /**
   * @minItems 1
   * @maxItems 16
   */
  payoffMatrix: AllocationPayoff[];
  equilibriumVerified: boolean;
  agreement: boolean;
}
export interface AllocationCandidate {
  agency: 'health' | 'shelter';
  assetId: string;
  label: string;
  cost: number;
  crews: number;
  actionId: string;
  equipment: number;
  hours: number;
  effectAssumption: string;
  source: string;
  exposed: boolean;
  status: 'available' | 'impaired' | 'blocked' | 'unknown';
}
export interface AllocationAccess {
  clinic: number;
  shelter: number;
}
export interface AllocationStrategy {
  id: 'independent' | 'coordinated' | 'bargaining';
  utilities: AllocationUtilities;
  spend: AllocationSpend;
  crewsUsed: number;
  access: AllocationAccess;
  /**
   * @minItems 0
   * @maxItems 12
   */
  interventions: AllocationIntervention[];
  jointUtility: number;
  gains: AllocationUtilities;
  nashProduct: number;
  explanation: string;
  weightedAccess: number;
  equipmentUsed: number;
  completionHours: number;
  /**
   * @minItems 1
   * @maxItems 6
   */
  frames: AllocationFrame[];
}
export interface AllocationUtilities {
  health: number;
  shelter: number;
}
export interface AllocationSpend {
  health: number;
  shelter: number;
}
export interface AllocationIntervention {
  agency: 'health' | 'shelter';
  assetId: string;
  label: string;
  cost: number;
  crews: number;
  actionId: string;
  accessWithout: AllocationAccess;
}
export interface AllocationFrame {
  hour: number;
  access: AllocationAccess;
  serviceEdges: AllocationPaths;
}
export interface AllocationPaths {
  /**
   * @maxItems 5
   */
  clinic: string[];
  /**
   * @maxItems 5
   */
  shelter: string[];
}
export interface AllocationPayoff {
  /**
   * @minItems 0
   * @maxItems 5
   */
  healthActions: string[];
  /**
   * @minItems 0
   * @maxItems 5
   */
  shelterActions: string[];
  utilities: AllocationUtilities;
  feasible: boolean;
}
export interface AllocationEvaluation {
  regionId: 'houston-gulf-coast';
  graphSource: string;
  phase: 'mitigation' | 'response';
  scenarioLabel: string;
  /**
   * @minItems 1
   * @maxItems 24
   */
  assumptions: string[];
  scenarioVersion: 1;
  graphVersion: string;
  assumptionSetId: string;
  dataMode: 'illustrative';
  /**
   * @minItems 1
   * @maxItems 20
   */
  sourceIds: string[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  limitations: string[];
  timestampUtc: string;
  /**
   * @minItems 0
   * @maxItems 20
   */
  candidates: AllocationCandidate[];
  baselineAccess: AllocationAccess;
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
