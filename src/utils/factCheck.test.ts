import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFactCheckReport,
  extractGroundingWebSources,
  parseMultiClaimFactCheckResponse,
  sanitizeNonJudgmentalFactSummary,
  selectClaimsForFactCheck,
} from './factCheck.ts';
import type { CoreClaim } from '../types/analysis.ts';

function makeClaim(idx: number, text: string): CoreClaim {
  return {
    id: `claim-${idx}`,
    claim: text,
    specificFiguresAndFacts: [],
    evidenceNeeds: '공식 자료 확인 필요',
  };
}

test('selectClaimsForFactCheck limits checked claims to max 3 and keeps remaining claims', () => {
  const claims = [
    makeClaim(1, '주장 1'),
    makeClaim(2, '주장 2'),
    makeClaim(3, '주장 3'),
    makeClaim(4, '주장 4'),
  ];
  const { toCheck, remaining } = selectClaimsForFactCheck(claims);
  assert.equal(toCheck.length, 3);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].claim, '주장 4');
});

test('extractGroundingWebSources keeps only safe http/https URLs and deduplicates', () => {
  const sources = extractGroundingWebSources([
    { web: { uri: 'https://www.kdca.go.kr/info', title: '질병관리청 안내' } },
    { web: { uri: 'https://www.kdca.go.kr/info', title: '중복 링크' } },
    { web: { uri: 'javascript:alert(1)', title: '악성 링크' } },
    { web: { uri: 'https://www.who.int/news', domain: 'who.int' } },
  ]);

  assert.equal(sources.length, 2);
  assert.deepEqual(sources[0], {
    title: '질병관리청 안내',
    url: 'https://www.kdca.go.kr/info',
  });
  assert.deepEqual(sources[1], {
    title: 'who.int',
    url: 'https://www.who.int/news',
  });
});

test('sanitizeNonJudgmentalFactSummary formats "검색된 자료에 따르면" and strips absolute truth verdicts', () => {
  const withSources = sanitizeNonJudgmentalFactSummary(
    '세계보건기구 자료에서는 성인 기준 하루 1.5~2L 수분 섭취를 권장합니다. 따라서 이 주장은 거짓입니다.',
    true
  );
  assert.equal(withSources.status, 'sources_found');
  assert.ok(withSources.summary.startsWith('검색된 자료에 따르면'));
  assert.ok(!withSources.summary.includes('거짓입니다'));

  const noSources = sanitizeNonJudgmentalFactSummary('관련 정보가 있습니다.', false);
  assert.equal(noSources.status, 'not_found');
  assert.equal(noSources.summary, '확인된 자료 없음');

  const explicitNotFound = sanitizeNonJudgmentalFactSummary('확인된 자료 없음', true);
  assert.equal(explicitNotFound.status, 'not_found');
  assert.equal(explicitNotFound.summary, '확인된 자료 없음');
});

test('parseMultiClaimFactCheckResponse maps groundingSupports to matching claims and keeps unfound claims empty', () => {
  const claims = [makeClaim(1, '2024년 최저임금은 9,860원이다.'), makeClaim(2, '달에 스타벅스가 열렸다.')];
  const responseText =
    '[CLAIM 1]\n검색된 자료에 따르면 2024년 적용 최저임금은 시간급 9,860원으로 고시되었습니다.\n[/CLAIM 1]\n\n[CLAIM 2]\n확인된 자료 없음\n[/CLAIM 2]';
  const claim1Start = responseText.indexOf('검색된 자료에 따르면');
  const claim1End = claim1Start + 35;

  const parsed = parseMultiClaimFactCheckResponse(claims, responseText, {
    groundingChunks: [
      { web: { uri: 'https://www.moel.go.kr/wage2024', title: '고용노동부 최저임금 고시' } },
    ],
    groundingSupports: [
      {
        segment: { startIndex: claim1Start, endIndex: claim1End },
        groundingChunkIndices: [0],
      },
    ],
    webSearchQueries: ['2024년 최저임금'],
  });

  assert.equal(parsed[0].status, 'sources_found');
  assert.equal(parsed[0].sources.length, 1);
  assert.equal(parsed[0].sources[0].url, 'https://www.moel.go.kr/wage2024');
  assert.equal(parsed[1].status, 'not_found');
  assert.equal(parsed[1].summary, '확인된 자료 없음');
  assert.equal(parsed[1].sources.length, 0);
});

test('buildFactCheckReport separates verified and not-found claim counts accurately', () => {
  const report = buildFactCheckReport(
    [
      {
        claimId: 'c1',
        claim: '주장 1',
        status: 'sources_found',
        summary: '검색된 자료에 따르면 공식 통계에서 확인됩니다.',
        sources: [{ title: '통계청', url: 'https://kostat.go.kr' }],
        searchQueries: ['주장 1 통계'],
      },
      {
        claimId: 'c2',
        claim: '주장 2',
        status: 'not_found',
        summary: '확인된 자료 없음',
        sources: [],
        searchQueries: ['주장 2 검색'],
      },
    ],
    [makeClaim(4, '추가 주장')]
  );

  assert.equal(report.checkedCount, 2);
  assert.equal(report.verifiedCount, 1);
  assert.equal(report.notFoundCount, 1);
  assert.equal(report.uncheckedClaims.length, 1);
});
