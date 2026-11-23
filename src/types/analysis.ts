export type InputMode = 'url' | 'text' | 'image';

export type PlatformType = 'youtube' | 'instagram' | 'tiktok' | 'threads' | 'web';

export type OverallStatus = 'needs_verification' | 'caution_found' | 'low_risk_observed';

export type ExaggerationCategory =
  | '과장 표현'
  | '근거 없는 확신'
  | '공포·불안 유발'
  | '소비자 오해 유발'
  | '광고·홍보성 표현';

export type AiLikelihoodLevel =
  | '가능성 낮음'
  | '판별 불확실'
  | '일부 AI 활용 가능성'
  | 'AI 생성·합성 의심 요소 발견';

export type ChecklistVerdict = '예' | '아니오' | '확인 필요';

export interface UrlInspectionResult {
  normalizedUrl: string;
  platform: PlatformType;
  youtubeVideoId?: string;
  title?: string;
  author?: string;
  thumbnailUrl?: string;
  transcriptText?: string;
  descriptionText?: string;
  accessStatus: 'extracted' | 'metadata_only' | 'inaccessible';
  accessMessage: string;
}

export interface CoreClaim {
  id: string;
  claim: string;
  specificFiguresAndFacts: string[];
  evidenceNeeds: string;
}

export interface ExaggeratedExpression {
  id: string;
  phrase: string;
  category: ExaggerationCategory;
  reason: string;
}

export interface SourceAssessment {
  hasCitedSources: boolean;
  citedSourcesSummary: string;
  claimsRequiringStatisticsOrStudies: string[];
  unverifiedWarning: string;
  recommendedOfficialSources: string[];
  recommendedSearchQueries: string[];
}

export interface AiGenerationAssessment {
  likelihoodLevel: AiLikelihoodLevel;
  observedIndicators: string[];
  audioOrSynthesisNotes: string;
  uncertaintyExplanation: string;
}

export interface ChecklistItem {
  id: string;
  question: string;
  category: '기본 검증' | '주장별 검증';
  hint: string;
  aiVerdict: ChecklistVerdict;
  aiReason: string;
  checked: boolean;
  note?: string;
}

export interface AnalyzedVideoInfo {
  title?: string;
  author?: string;
  thumbnailUrl?: string;
  normalizedUrl?: string;
  uploadedFileName?: string;
  whatVideoIsAbout: string;
}

export interface ThreeLineSummary {
  whatItIs: string;
  watchOutFor: string;
  howToVerify: string;
}

export type AiSuspicionLevel = '의심 단서 적음' | '일부 의심' | '의심 단서 많음' | '판별 불가';

export interface AiTimestampClue {
  id: string;
  category: string;
  timestamp: string;
  description: string;
}

export interface AiLogoClue {
  toolName: string;
  timestamp: string;
  description: string;
}

export interface RealFootageClue {
  timestamp?: string;
  description: string;
}

export interface AiSuspicionBreakdown {
  available: boolean;
  totalScore: number | null;
  maxScore: 100;
  level: AiSuspicionLevel;
  logoFound: boolean;
  logoScore: number;
  logoMaxScore: 40;
  timestampedClueCount: number;
  excludedClueCount: number;
  timestampCluesScore: number;
  timestampCluesMaxScore: 40;
  metadataKeywordFound: boolean;
  metadataKeywordScore: number;
  metadataKeywordMaxScore: 20;
  totalCluesDetected: number;
}

export interface AiSuspicionReport {
  available: boolean;
  score: number | null;
  level: AiSuspicionLevel;
  breakdown: AiSuspicionBreakdown;
  creatorDisclosedSyntheticMedia: boolean;
  aiLogos: AiLogoClue[];
  visualAndAudioClues: AiTimestampClue[];
  metadataKeywords: string[];
  realFootageClues: RealFootageClue[];
  summaryNote: string;
  sampledFps?: number;
  agenticVideoEnabled?: boolean;
}

export interface ScoreBreakdown {
  totalScore: number;
  maxScore: 100;
  checklistScore: number;
  checklistMaxScore: 75;
  checklistItemsBreakdown: Array<{
    id: string;
    label: string;
    verdict: ChecklistVerdict;
    score: number;
    maxScore: 15;
  }>;
  exaggerationScore: number;
  exaggerationMaxScore: 15;
  exaggerationCount: number;
  aiGenerationScore: number;
  aiGenerationMaxScore: 10;
  aiLikelihoodLevel: AiLikelihoodLevel;
  aiSuspicionScore?: number | null;
  aiSuspicionLevel?: AiSuspicionLevel;
}

export interface FactCheckSource {
  title: string;
  url: string;
}

export type FactCheckStatus = 'sources_found' | 'not_found';

export interface ClaimFactCheck {
  claimId: string;
  claim: string;
  status: FactCheckStatus;
  summary: string;
  sources: FactCheckSource[];
  searchQueries: string[];
}

export interface FactCheckReport {
  checkedCount: number;
  verifiedCount: number;
  notFoundCount: number;
  items: ClaimFactCheck[];
  uncheckedClaims: CoreClaim[];
}

export interface AnalysisReport {
  id: string;
  createdAt: string;
  inputMode: InputMode;
  sourceUrl?: string;
  platform?: PlatformType;
  contentTitle: string;
  analyzedVideoInfo?: AnalyzedVideoInfo;
  inputSummary: string;
  extractedImageText?: string;
  reliabilityScore: number;
  scoreBreakdown: ScoreBreakdown;
  aiSuspicion?: AiSuspicionReport;
  factCheck?: FactCheckReport;
  overallStatus: OverallStatus;
  overallSummary: string;
  threeLineSummary: ThreeLineSummary;
  disclaimer: string;
  coreClaims: CoreClaim[];
  exaggeratedExpressions: ExaggeratedExpression[];
  sourceAssessment: SourceAssessment;
  aiGenerationAssessment: AiGenerationAssessment;
  additionalVerificationSteps: string[];
  checklist: ChecklistItem[];
}
