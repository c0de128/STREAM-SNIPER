// Offscreen document (Chrome MV3) - runs in-browser HLS downloads on behalf of the
// service worker, which cannot create blob URLs. Communicates purely via runtime messages.

const offscreenJobs = new Map();

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return;

  if (message.action === 'hlsDownload') {
    runHlsJob(message);
    sendResponse({ accepted: true });
    return;
  }

  if (message.action === 'hlsCancel') {
    const job = offscreenJobs.get(message.jobId);
    if (job) job.controller.abort();
    sendResponse({ cancelled: !!job });
    return;
  }

  if (message.action === 'revokeBlobUrl') {
    try { URL.revokeObjectURL(message.blobUrl); } catch (e) { /* ignore */ }
    sendResponse({ ok: true });
    return;
  }

  if (message.action === 'ping') {
    sendResponse({ ok: true, jobs: offscreenJobs.size });
  }
});

async function runHlsJob(message) {
  const { jobId, url, quality } = message;
  const controller = new AbortController();
  offscreenJobs.set(jobId, { controller });

  const post = (payload) => browser.runtime.sendMessage({ action: 'offscreenHlsEvent', jobId, ...payload }).catch(() => {});

  try {
    const result = await HlsDownloader.download({
      url,
      quality,
      signal: controller.signal,
      onProgress: (p) => post({ event: 'progress', progress: p })
    });

    const blobUrl = URL.createObjectURL(result.blob);
    post({
      event: 'complete',
      blobUrl,
      container: result.container,
      bytes: result.bytes,
      segments: result.segments,
      live: result.live
    });
  } catch (error) {
    post({ event: 'error', error: error.name === 'AbortError' ? 'Cancelled' : error.message });
  } finally {
    offscreenJobs.delete(jobId);
  }
}
