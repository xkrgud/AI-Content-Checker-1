import type {
  ClaimFactCheck,
  CoreClaim,
  FactCheckReport,
  FactCheckSource,
  FactCheckStatus,
} from '../types/analysis.ts';

export const MAX_FACT_CHECK_CLAIMS = 3;

export function selectClaimsForFactCheck(coreClaims: CoreClaim[]): {
  toCheck: CoreClaim[];
  remaining: CoreClaim[];
} {
  const validClaims = coreClaims.filter((c) => Boolean(c?.claim?.trim()));
  return {
    toCheck: validClaims.slice(0, MAX_FACT_CHECK_CLAIMS),
    remaining: validClaims.slice(MAX_FACT_CHECK_CLAIMS),
  };
}

export function isSafeHttpUrl(rawUrl?: string): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function extractGroundingWebSources(
  groundingChunks?: Array<{
    web?: {
      uri?: string;
      title?: string;
      domain?: string;
    };
  }>,
  maxSources = 5
): FactCheckSource[] {
  if (!Array.isArray(groundingChunks)) return [];

  const seenUrls = new Set<string>();
  const sources: FactCheckSource[] = [];

  for (const chunk of groundingChunks) {
    const rawUri = chunk?.web?.uri?.trim();
    if (!rawUri || !isSafeHttpUrl(rawUri) || seenUrls.has(rawUri)) {
      continue;
    }

    let fallbackTitle = chunk?.web?.domain?.trim() || '';
    if (!fallbackTitle) {
      try {
        fallbackTitle = new URL(rawUri).hostname.replace(/^www\./, '');
      } catch {
        fallbackTitle = '참고 출처';
      }
    }

    const title = chunk?.web?.title?.trim() || fallbackTitle;
    seenUrls.add(rawUri);
    sources.push({ title, url: rawUri });

    if (sources.length >= maxSources) {
      break;
    }
  }

  return sources;
}

const NOT_FOUND_PATTERNS = [
  /^확인된\s*자료\s*없음[.!]?$/i,
  /확인된\s*자료(?:가|를)?\s*없(?:음|습니다|어요)/i,
  /검색된\s*자료(?:가|를)?\s*(?:찾을\s*수\s*없|없습니다|없어요)/i,
  /관련\s*(?:공식\s*)?자료를?\s*찾지\s*못/i,
  /근거\s*자료를?\s*찾을\s*수\s*없/i,
];

const ABSOLUTE_VERDICT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/100%\s*사실입니다/g, '관련 자료에서 언급된 내용입니다'],
  [/무조건\s*사실(?:입니다|이에요)/g, '자료에 나타난 내용입니다'],
  [/완전한\s*거짓(?:입니다|이에요)/g, '자료의 내용과 다른 부분이 있습니다'],
  [/명백한\s*허위(?:입니다|이에요)/g, '확인된 자료의 수치·사실과 차이가 있습니다'],
  [/사실로\s*판명(?:되었습니다|됐습니다|됨)/g, '관련 자료에서 비슷한 내용이 확인됩니다'],
  [/거짓으로\s*판명(?:되었습니다|됐습니다|됨)/g, '검색된 자료와는 다른 내용이 확인됩니다'],
  [/따라서\s*(?:이\s*주장은\s*)?(?:참|사실)(?:입니다|이에요)[.]?/g, ''],
  [/따라서\s*(?:이\s*주장은\s*)?(?:거짓|허위)(?:입니다|이에요)[.]?/g, ''],
  [/결론적으로\s*(?:참|사실|거짓|허위)(?:입니다|이에요)[.]?/g, ''],
];

export function sanitizeNonJudgmentalFactSummary(
  rawText: string,
  hasSources: boolean
): { status: FactCheckStatus; summary: string } {
  const cleaned = rawText
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!hasSources || !cleaned || NOT_FOUND_PATTERNS.some((pat) => pat.test(cleaned))) {
    return {
      status: 'not_found',
      summary: '확인된 자료 없음',
    };
  }

  let normalized = cleaned;
  for (const [pattern, replacement] of ABSOLUTE_VERDICT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalized.replace(/\s+/g, ' ').trim();

  if (!normalized || NOT_FOUND_PATTERNS.some((pat) => pat.test(normalized))) {
    return {
      status: 'not_found',
      summary: '확인된 자료 없음',
    };
  }

  if (!normalized.startsWith('검색된 자료에 따르면')) {
    normalized = normalized.replace(/^검색\s*결과(?:에\s*따르면)?[,:]?\s*/i, '');
    normalized = `검색된 자료에 따르면 ${normalized}`;
  }

  return {
    status: 'sources_found',
    summary: normalized,
  };
}

export function buildFactCheckReport(
  checkedItems: ClaimFactCheck[],
  remainingClaims: CoreClaim[]
): FactCheckReport {
  const verifiedCount = checkedItems.filter((item) => item.status === 'sources_found').length;
  const notFoundCount = checkedItems.filter((item) => item.status === 'not_found').length;

  return {
    checkedCount: checkedItems.length,
    verifiedCount,
    notFoundCount,
    items: checkedItems,
    uncheckedClaims: remainingClaims,
  };
}

export interface GroundingMetadataInput {
  groundingChunks?: Array<{
    web?: {
      uri?: string;
      title?: string;
      domain?: string;
    };
  }>;
  groundingSupports?: Array<{
    groundingChunkIndices?: number[];
    segment?: {
      startIndex?: number;
      endIndex?: number;
      text?: string;
    };
  }>;
  webSearchQueries?: string[];
}

export function parseMultiClaimFactCheckResponse(
  claims: CoreClaim[],
  responseText: string,
  groundingMeta?: GroundingMetadataInput
): ClaimFactCheck[] {
  const allChunks = Array.isArray(groundingMeta?.groundingChunks)
    ? groundingMeta.groundingChunks
    : [];
  const supports = Array.isArray(groundingMeta?.groundingSupports)
    ? groundingMeta.groundingSupports
    : [];
  const allSearchQueries = Array.isArray(groundingMeta?.webSearchQueries)
    ? groundingMeta.webSearchQueries.filter((q): q is string => Boolean(q?.trim()))
    : [];

  const text = responseText || '';

  return claims.map((claimItem, idx) => {
    const num = idx + 1;
    const tagRegex = new RegExp(
      `\\[CLAIM\\s*${num}\\]([\\s\\S]*?)\\[\\/CLAIM\\s*${num}\\]`,
      'i'
    );
    const match = tagRegex.exec(text);

    let blockText = '';
    let blockStart = -1;
    let blockEnd = -1;

    if (match) {
      blockText = (match[1] || '').trim();
      blockStart = match.index;
      blockEnd = match.index + match[0].length;
    } else if (claims.length === 1 && text.trim()) {
      blockText = text.trim();
      blockStart = 0;
      blockEnd = text.length;
    }

    // Match groundingChunks attributed to this claim's text span via groundingSupports
    let matchedIndices: number[] = [];
    if (blockStart >= 0 && supports.length > 0) {
      const indexSet = new Set<number>();
      for (const support of supports) {
        const segStart = support?.segment?.startIndex;
        const segEnd = support?.segment?.endIndex;
        const segText = support?.segment?.text?.trim();

        const overlapsBySpan =
          typeof segStart === 'number' &&
          typeof segEnd === 'number' &&
          segEnd > blockStart &&
          segStart < blockEnd;
        const overlapsByText = Boolean(segText && blockText.includes(segText));

        if ((overlapsBySpan || overlapsByText) && Array.isArray(support.groundingChunkIndices)) {
          for (const chunkIdx of support.groundingChunkIndices) {
            if (typeof chunkIdx === 'number' && chunkIdx >= 0 && chunkIdx < allChunks.length) {
              indexSet.add(chunkIdx);
            }
          }
        }
      }
      matchedIndices = Array.from(indexSet);
    }

    const scopedChunks =
      matchedIndices.length > 0
        ? matchedIndices.map((chunkIdx) => allChunks[chunkIdx])
        : supports.length === 0
          ? allChunks
          : [];

    const sources = extractGroundingWebSources(scopedChunks);
    const { status, summary } = sanitizeNonJudgmentalFactSummary(blockText, sources.length > 0);

    return {
      claimId: claimItem.id,
      claim: claimItem.claim,
      status,
      summary,
      sources: status === 'sources_found' ? sources : [],
      searchQueries: allSearchQueries,
    };
  });
}
