import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canStartUrlScreenAnalysis,
  INLINE_VIDEO_LIMIT_BYTES,
  resolveVideoMimeType,
  shouldUseGeminiFileApi,
  validateVideoFileMeta,
} from './videoUpload';
import { isInstagramUrl, validateAndNormalizeUrl } from './urlParser';

test('shouldUseGeminiFileApi sends <100MB inline and >=100MB via File API', () => {
  assert.equal(shouldUseGeminiFileApi(10 * 1024 * 1024), false);
  assert.equal(shouldUseGeminiFileApi(INLINE_VIDEO_LIMIT_BYTES - 1), false);
  assert.equal(shouldUseGeminiFileApi(INLINE_VIDEO_LIMIT_BYTES), true);
  assert.equal(shouldUseGeminiFileApi(150 * 1024 * 1024), true);
});

test('validateVideoFileMeta accepts mp4/mov and rejects invalid or empty files', () => {
  const mp4 = validateVideoFileMeta({ name: 'reel.mp4', type: 'video/mp4', size: 1024 * 500 });
  assert.equal(mp4.valid, true);
  assert.equal(mp4.mimeType, 'video/mp4');

  const movNoMime = validateVideoFileMeta({ name: 'clip.MOV', type: '', size: 2048 });
  assert.equal(movNoMime.valid, true);
  assert.equal(movNoMime.mimeType, 'video/quicktime');

  assert.equal(resolveVideoMimeType('doc.pdf', 'application/pdf'), null);
  assert.equal(
    validateVideoFileMeta({ name: 'empty.mp4', type: 'video/mp4', size: 0 }).valid,
    false
  );
  assert.equal(
    validateVideoFileMeta({ name: 'note.txt', type: 'text/plain', size: 100 }).valid,
    false
  );
});

test('isInstagramUrl and validateAndNormalizeUrl detect Instagram Reels links cleanly', () => {
  assert.equal(isInstagramUrl('https://www.instagram.com/reel/C8xSample99/'), true);
  assert.equal(isInstagramUrl('https://instagr.am/p/AbCdEf/'), true);
  assert.equal(isInstagramUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ'), false);

  const parsed = validateAndNormalizeUrl('https://www.instagram.com/reel/C8xSample99/');
  assert.equal(parsed.platform, 'instagram');
  assert.equal(parsed.isShortVideo, true);
});

test('canStartUrlScreenAnalysis blocks Instagram link without video upload and allows with video or standalone video', () => {
  const blocked = canStartUrlScreenAnalysis({
    urlInput: 'https://www.instagram.com/reel/C8xSample99/',
    hasUploadedVideo: false,
    transcriptInput: '자막이 있어도 영상 업로드가 필요함',
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'instagram_video_required');
  assert.match(blocked.error ?? '', /다운로드/);
  assert.match(blocked.error ?? '', /AI 정보/);

  const allowedWithVideo = canStartUrlScreenAnalysis({
    urlInput: 'https://www.instagram.com/reel/C8xSample99/',
    hasUploadedVideo: true,
    transcriptInput: '',
  });
  assert.equal(allowedWithVideo.allowed, true);

  const allowedGalleryOnly = canStartUrlScreenAnalysis({
    urlInput: '',
    hasUploadedVideo: true,
    transcriptInput: '',
  });
  assert.equal(allowedGalleryOnly.allowed, true);
});
