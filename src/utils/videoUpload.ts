import { validateAndNormalizeUrl } from './urlParser.ts';

export const INLINE_VIDEO_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_UPLOAD_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB safety cap

const EXTENSION_MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
};

const ALLOWED_MIME_TYPES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/3gpp',
  'video/mpeg',
]);

export function shouldUseGeminiFileApi(sizeBytes: number): boolean {
  return sizeBytes >= INLINE_VIDEO_LIMIT_BYTES;
}

export function resolveVideoMimeType(fileName: string, rawMimeType?: string): string | null {
  const normalizedMime = rawMimeType?.trim().toLowerCase().split(';')[0] || '';
  if (normalizedMime.startsWith('video/') && (ALLOWED_MIME_TYPES.has(normalizedMime) || normalizedMime === 'video/mp4' || normalizedMime === 'video/quicktime')) {
    return normalizedMime === 'video/x-m4v' ? 'video/mp4' : normalizedMime;
  }
  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : '';
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }
  if (normalizedMime.startsWith('video/')) {
    return normalizedMime;
  }
  return null;
}

export function validateVideoFileMeta(file: {
  name: string;
  type?: string;
  size: number;
}): { valid: boolean; mimeType?: string; error?: string } {
  if (!file || typeof file.size !== 'number' || file.size <= 0) {
    return { valid: false, error: '비어 있는 영상 파일은 분석할 수 없어요.' };
  }
  if (file.size > MAX_UPLOAD_VIDEO_BYTES) {
    return {
      valid: false,
      error: '영상 파일 용량은 최대 500MB 이하까지만 업로드할 수 있어요.',
    };
  }
  const resolvedMime = resolveVideoMimeType(file.name || '', file.type);
  if (!resolvedMime) {
    return {
      valid: false,
      error: 'MP4, MOV 등 지원되는 영상 파일만 업로드할 수 있어요.',
    };
  }
  return { valid: true, mimeType: resolvedMime };
}

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 0.1) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export function canStartUrlScreenAnalysis(params: {
  urlInput: string;
  hasUploadedVideo: boolean;
  transcriptInput: string;
}): {
  allowed: boolean;
  reason?:
    | 'instagram_video_required'
    | 'invalid_url'
    | 'external_context_required';
  error?: string;
} {
  const trimmedUrl = params.urlInput.trim();

  if (!trimmedUrl && params.hasUploadedVideo) {
    return { allowed: true };
  }

  const validation = validateAndNormalizeUrl(trimmedUrl);
  if (!validation.valid || !validation.normalizedUrl || !validation.platform) {
    return {
      allowed: false,
      reason: 'invalid_url',
      error: validation.error || '올바른 영상 또는 게시물 링크를 입력해 주세요.',
    };
  }

  if (validation.platform === 'instagram' && !params.hasUploadedVideo) {
    return {
      allowed: false,
      reason: 'instagram_video_required',
      error:
        "인스타 릴스는 링크로 영상을 볼 수 없어요. 인스타 공유 버튼 → '다운로드'로 저장한 뒤 영상을 올려 주세요. 게시물에 'AI 정보' 표시가 있는지도 직접 확인해 보세요.",
    };
  }

  const isYouTube = validation.platform === 'youtube' && Boolean(validation.youtubeVideoId);
  if (!isYouTube && !params.hasUploadedVideo && params.transcriptInput.trim().length < 8) {
    return {
      allowed: false,
      reason: 'external_context_required',
      error:
        '영상을 불러올 수 없어요. 이 링크는 플랫폼 제한으로 영상을 직접 불러올 수 없으니 아래 입력란에 영상 내용이나 자막을 입력해 주세요.',
    };
  }

  return { allowed: true };
}
