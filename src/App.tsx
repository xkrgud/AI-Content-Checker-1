import { useEffect, useRef, useState } from 'react';
import { Header, type ActiveTab } from './components/Header';
import { InputWorkbench } from './components/InputWorkbench';
import { AnalysisProgress } from './components/AnalysisProgress';
import { AnalysisReportView } from './components/AnalysisReportView';
import { ChecklistView } from './components/ChecklistView';
import { ShareGuideView } from './components/ShareGuideView';
import { HistoryView } from './components/HistoryView';
import type {
  AnalysisReport,
  ChecklistItem,
  PlatformType,
  UrlInspectionResult,
} from './types/analysis';
import { buildDefaultChecklist } from './utils/analysisHelpers';
import { consumeSharedMediaRecord } from './utils/shareStorage';
import { extractShareTargetParams, validateAndNormalizeUrl } from './utils/urlParser';
import { canStartUrlScreenAnalysis, validateVideoFileMeta } from './utils/videoUpload';

const HISTORY_STORAGE_KEY = 'ai_content_checker_history_v1';

function loadSavedHistory(): AnalysisReport[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnalysisReport[]) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('analyze');
  const [urlInput, setUrlInput] = useState('');
  const [shortVideoNormalizedUrl, setShortVideoNormalizedUrl] = useState<string | null>(null);
  const [contentTitle, setContentTitle] = useState('');
  const [transcriptInput, setTranscriptInput] = useState('');
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [inspectionResult, setInspectionResult] = useState<UrlInspectionResult | null>(null);

  const [sharedNotice, setSharedNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [currentReport, setCurrentReport] = useState<AnalysisReport | null>(null);
  const [standaloneChecklist] = useState<ChecklistItem[]>(() => buildDefaultChecklist([]));
  const [history, setHistory] = useState<AnalysisReport[]>(() => loadSavedHistory());

  const analyzeAbortRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 20)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      analyzeAbortRef.current?.abort();
    };
  }, []);

  const applySharedUrl = async (
    sharedUrl: string,
    sharedTitle?: string,
    sharedText?: string,
    sharedFileNotice?: string
  ) => {
    setActiveTab('analyze');
    setCurrentReport(null);
    setUrlInput(sharedUrl);
    if (sharedTitle) setContentTitle(sharedTitle);
    if (sharedText && sharedText !== sharedUrl) {
      setTranscriptInput(sharedText);
    }

    const validation = validateAndNormalizeUrl(sharedUrl);
    if (!validation.valid || !validation.normalizedUrl) {
      setSharedNotice(
        sharedFileNotice ||
          '외부 앱에서 공유 데이터가 전달되었으나 유효한 링크 형식을 찾지 못했습니다. 링크를 확인해 주세요.'
      );
      return;
    }

    setUrlInput(validation.normalizedUrl);
    setShortVideoNormalizedUrl(validation.isShortVideo ? validation.normalizedUrl : null);
    setSharedNotice(
      sharedFileNotice
        ? `${sharedFileNotice} 공유된 링크(${validation.normalizedUrl})도 함께 입력창에 등록했습니다.`
        : `공유된 링크(${validation.normalizedUrl})를 입력창에 자동 등록했습니다.`
    );

    try {
      const res = await fetch('/api/inspect-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validation.normalizedUrl }),
      });
      if (res.ok) {
        const data = (await res.json()) as UrlInspectionResult;
        setInspectionResult(data);
        if (data.title && !sharedTitle) setContentTitle(data.title);
        if (data.transcriptText) {
          setTranscriptInput(data.transcriptText);
        } else if (data.descriptionText && !sharedText) {
          setTranscriptInput(data.descriptionText);
        }
      }
    } catch {
      // Keep registered URL even if metadata inspection fails
    }
  };

  useEffect(() => {
    let cancelled = false;

    const handleInitialShareParams = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const shareId = searchParams.get('shareId')?.trim() || undefined;
      const shared = extractShareTargetParams(window.location.search);

      let idbPayload = null;
      if (shareId) {
        idbPayload = await consumeSharedMediaRecord(shareId);
      }

      if (cancelled) return;

      const resolvedUrl = idbPayload?.url || shared.url;
      const resolvedTitle = idbPayload?.title || shared.title;
      const resolvedText = idbPayload?.text || shared.text;

      let fileNotice: string | undefined;
      if (idbPayload?.file) {
        const fileCheck = validateVideoFileMeta(idbPayload.file);
        if (fileCheck.valid) {
          setActiveTab('analyze');
          setCurrentReport(null);
          setUploadedVideoFile(idbPayload.file);
          fileNotice = `공유된 영상 파일(${idbPayload.file.name})을 업로드 칸에 바로 등록했습니다.`;
        } else {
          setErrorMessage(
            fileCheck.error || '공유된 영상 파일 형식이 지원되지 않습니다. MP4·MOV 파일을 사용해 주세요.'
          );
        }
      }

      if (resolvedUrl) {
        await applySharedUrl(resolvedUrl, resolvedTitle, resolvedText, fileNotice);
      } else if (fileNotice) {
        if (resolvedTitle) setContentTitle(resolvedTitle);
        if (resolvedText) setTranscriptInput(resolvedText);
        setSharedNotice(
          `${fileNotice} 바로 '신뢰도 분석 시작'을 누르거나 추가 링크·메모를 적을 수 있어요.`
        );
      } else if (shared.hasSharedParams && (resolvedText || resolvedTitle)) {
        if (resolvedTitle) setContentTitle(resolvedTitle);
        if (resolvedText) setTranscriptInput(resolvedText);
        setSharedNotice(
          '외부 앱에서 전달된 내용을 영상 자막·메모 입력창에 등록했습니다. 영상 링크를 입력해 주세요.'
        );
      }

      if ((shareId || shared.hasSharedParams) && window.history?.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    void handleInitialShareParams();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSimulateVideoShare = () => {
    // Minimal valid-header MP4 blob for gallery video share target preview
    const sampleMp4Bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    const sampleFile = new File([sampleMp4Bytes], 'gallery-shared-reel.mp4', {
      type: 'video/mp4',
    });
    setActiveTab('analyze');
    setCurrentReport(null);
    setErrorMessage(null);
    setUploadedVideoFile(sampleFile);
    setSharedNotice(
      `안드로이드 갤러리 공유 시뮬레이션으로 영상(${sampleFile.name})이 업로드 칸에 등록되었습니다.`
    );
  };

  const handleCancelAnalysis = () => {
    activeRequestIdRef.current += 1;
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
      analyzeAbortRef.current = null;
    }
    setIsAnalyzing(false);
    setErrorMessage(null);
  };

  const handleStartAnalysis = async () => {
    setErrorMessage(null);

    const gate = canStartUrlScreenAnalysis({
      urlInput,
      hasUploadedVideo: Boolean(uploadedVideoFile),
      transcriptInput,
    });
    if (!gate.allowed) {
      setErrorMessage(gate.error || '분석할 영상 링크 또는 영상 파일을 확인해 주세요.');
      return;
    }

    const trimmedUrl = urlInput.trim();
    let normalizedUrl: string | undefined;
    let detectedPlatform: PlatformType = 'web';
    let isShortVideo = true;

    if (trimmedUrl) {
      const validation = validateAndNormalizeUrl(trimmedUrl);
      if (!validation.valid || !validation.normalizedUrl || !validation.platform) {
        setErrorMessage(validation.error || '올바른 영상 또는 게시물 링크를 입력해 주세요.');
        return;
      }
      normalizedUrl = validation.normalizedUrl;
      detectedPlatform = validation.platform;
      isShortVideo = Boolean(
        validation.isShortVideo ||
          shortVideoNormalizedUrl === normalizedUrl ||
          detectedPlatform === 'instagram'
      );
      if (isShortVideo) {
        setShortVideoNormalizedUrl(normalizedUrl);
      }
      setUrlInput(normalizedUrl);
    }

    if (uploadedVideoFile) {
      const fileCheck = validateVideoFileMeta(uploadedVideoFile);
      if (!fileCheck.valid) {
        setErrorMessage(fileCheck.error || '지원되는 영상 파일(mp4, mov)을 선택해 주세요.');
        return;
      }
    }

    // Abort any previous in-flight analysis before starting a new one
    if (analyzeAbortRef.current) {
      analyzeAbortRef.current.abort();
    }
    const controller = new AbortController();
    analyzeAbortRef.current = controller;
    const requestId = ++activeRequestIdRef.current;

    setIsAnalyzing(true);
    try {
      let response: Response;
      const effectiveTitle = contentTitle.trim() || inspectionResult?.title || '';
      const effectiveNotes = transcriptInput.trim();

      if (uploadedVideoFile) {
        const formData = new FormData();
        formData.append('videoFile', uploadedVideoFile);
        formData.append('inputMode', 'url');
        if (normalizedUrl) {
          formData.append('sourceUrl', normalizedUrl);
          formData.append('platform', detectedPlatform);
        }
        formData.append('isShortVideo', String(isShortVideo));
        if (effectiveTitle) {
          formData.append('contentTitle', effectiveTitle);
        }
        if (effectiveNotes) {
          formData.append('transcriptOrNotes', effectiveNotes);
        }

        response = await fetch('/api/analyze', {
          method: 'POST',
          signal: controller.signal,
          body: formData,
        });
      } else {
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            inputMode: 'url',
            sourceUrl: normalizedUrl,
            platform: detectedPlatform,
            isShortVideo,
            contentTitle: effectiveTitle || undefined,
            transcriptOrNotes: effectiveNotes || undefined,
          }),
        });
      }

      const data = await response.json();

      if (controller.signal.aborted || requestId !== activeRequestIdRef.current) {
        return;
      }

      if (!response.ok) {
        setErrorMessage(data.error || '콘텐츠 분석 중 오류가 발생했습니다.');
        return;
      }

      const checklist: ChecklistItem[] = Array.isArray(data.checklist)
        ? data.checklist
        : buildDefaultChecklist(data.coreClaims || []);

      const report: AnalysisReport = {
        id: `rep-${Date.now()}`,
        createdAt: new Date().toISOString(),
        inputMode: 'url',
        sourceUrl: data.normalizedUrl || normalizedUrl,
        platform: data.platform || detectedPlatform,
        contentTitle: data.contentTitle,
        analyzedVideoInfo: data.analyzedVideoInfo,
        inputSummary: data.inputSummary,
        extractedImageText: data.extractedImageText,
        reliabilityScore: data.reliabilityScore,
        scoreBreakdown: data.scoreBreakdown,
        aiSuspicion: data.aiSuspicion,
        factCheck: data.factCheck,
        overallStatus: data.overallStatus,
        overallSummary: data.overallSummary,
        threeLineSummary: data.threeLineSummary,
        disclaimer: data.disclaimer,
        coreClaims: data.coreClaims,
        exaggeratedExpressions: data.exaggeratedExpressions,
        sourceAssessment: data.sourceAssessment,
        aiGenerationAssessment: data.aiGenerationAssessment,
        additionalVerificationSteps: data.additionalVerificationSteps,
        checklist,
      };

      setCurrentReport(report);
      setHistory((prev) => [report, ...prev].slice(0, 20));
      setActiveTab('analyze');
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        controller.signal.aborted ||
        requestId !== activeRequestIdRef.current
      ) {
        return;
      }
      setErrorMessage('서버와 통신하지 못했습니다. 네트워크 연결 상태를 확인해 주세요.');
    } finally {
      if (analyzeAbortRef.current === controller) {
        analyzeAbortRef.current = null;
      }
      if (requestId === activeRequestIdRef.current) {
        setIsAnalyzing(false);
      }
    }
  };

  const handleResetToNew = () => {
    handleCancelAnalysis();
    setCurrentReport(null);
    setUploadedVideoFile(null);
    setErrorMessage(null);
    setActiveTab('analyze');
  };

  const activeChecklistItems = currentReport ? currentReport.checklist : standaloneChecklist;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header
        activeTab={activeTab}
        hasReport={Boolean(currentReport)}
        historyCount={history.length}
        onSelectTab={setActiveTab}
        onResetToNew={handleResetToNew}
      />

      <main className="flex-1">
        {isAnalyzing ? (
          <AnalysisProgress
            contentLabel={
              contentTitle || urlInput || uploadedVideoFile?.name || '영상 콘텐츠'
            }
            onCancel={handleCancelAnalysis}
          />
        ) : activeTab === 'analyze' ? (
          currentReport ? (
            <AnalysisReportView
              report={currentReport}
              onOpenChecklist={() => setActiveTab('checklist')}
              onStartNew={handleResetToNew}
            />
          ) : (
            <InputWorkbench
              urlInput={urlInput}
              onChangeUrlInput={setUrlInput}
              contentTitle={contentTitle}
              onChangeContentTitle={setContentTitle}
              transcriptInput={transcriptInput}
              onChangeTranscriptInput={setTranscriptInput}
              uploadedVideoFile={uploadedVideoFile}
              onChangeUploadedVideoFile={setUploadedVideoFile}
              inspectionResult={inspectionResult}
              onSetInspectionResult={setInspectionResult}
              sharedNotice={sharedNotice}
              onDismissSharedNotice={() => setSharedNotice(null)}
              errorMessage={errorMessage}
              onClearError={() => setErrorMessage(null)}
              onStartAnalysis={handleStartAnalysis}
              isAnalyzing={isAnalyzing}
            />
          )
        ) : activeTab === 'checklist' ? (
          <ChecklistView
            report={currentReport}
            items={activeChecklistItems}
            onBackToReport={() => setActiveTab('analyze')}
            onStartNew={handleResetToNew}
          />
        ) : activeTab === 'history' ? (
          <HistoryView
            reports={history}
            onSelectReport={(rep) => {
              setCurrentReport(rep);
              setActiveTab('analyze');
            }}
            onDeleteReport={(id) => {
              setHistory((prev) => prev.filter((r) => r.id !== id));
              if (currentReport?.id === id) {
                setCurrentReport(null);
              }
            }}
            onStartNew={handleResetToNew}
          />
        ) : (
          <ShareGuideView
            onSimulateShareTarget={(url, title) => {
              void applySharedUrl(url, title);
            }}
            onSimulateVideoShare={handleSimulateVideoShare}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>AI Content Checker · 미디어 리터러시 지원 분석 도구</span>
          <span>
            AI 분석은 참고 정보이며, 출처 확인과 최종 사실 판단은 사용자가 직접 진행합니다.
          </span>
        </div>
      </footer>
    </div>
  );
}
