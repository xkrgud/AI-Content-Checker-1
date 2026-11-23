import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface AnalysisProgressProps {
  contentLabel: string;
  onCancel: () => void;
}

const PIPELINE_STEPS = [
  {
    id: 'claims',
    title: '01. 핵심 주장 및 수치 추출',
    description: '콘텐츠의 중심 내용과 구체적 수치·사실 주장을 항목별로 분리합니다.',
  },
  {
    id: 'exaggeration',
    title: '02. 과장 및 오해 유발 표현 분석',
    description: '근거 없는 확신, 공포·불안 조장, 광고·홍보성 문구를 점검합니다.',
  },
  {
    id: 'sources',
    title: '03. 출처 및 근거 확인 필요성 검토',
    description: '통계·연구 확인이 필요한 부분과 직접 검색할 키워드를 정리합니다.',
  },
  {
    id: 'ai-gen',
    title: '04. AI 생성 가능성 및 한계 평가',
    description: '합성·생성 가능성에 관한 시각적·맥락적 단서와 판별 불확실성을 안내합니다.',
  },
  {
    id: 'fact-check',
    title: '05. 핵심 주장 Google 검색 자료 확인',
    description: '추출된 핵심 주장(최대 3개)에 대해 Google 검색으로 실제 자료와 출처를 대조합니다.',
  },
];

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({ contentLabel, onCancel }) => {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev < PIPELINE_STEPS.length - 1 ? prev + 1 : prev));
    }, 1100);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div
        aria-live="polite"
        className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-blue-700">AI 신뢰도 분석 진행 중</p>
            <h2 className="mt-1.5 text-xl font-bold text-slate-950 sm:text-2xl">
              콘텐츠의 주장과 근거 구조를 점검하고 있습니다
            </h2>
            <p className="mt-1 text-sm text-slate-600 truncate max-w-xl">{contentLabel}</p>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-blue-700 shrink-0" aria-hidden="true" />
        </div>

        <ol className="mt-8 space-y-4">
          {PIPELINE_STEPS.map((step, index) => {
            const isCompleted = index < activeIndex;
            const isCurrent = index === activeIndex;

            return (
              <li
                key={step.id}
                className={`flex items-start gap-3.5 rounded-xl border p-4 transition-colors ${
                  isCurrent
                    ? 'border-blue-200 bg-blue-50/70'
                    : isCompleted
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs font-mono text-slate-500 tabular-nums">
                      {index + 1}
                    </span>
                  )}
                </div>
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      isCurrent || isCompleted ? 'text-slate-950' : 'text-slate-500'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            분석 취소
          </button>
        </div>
      </div>
    </div>
  );
};
