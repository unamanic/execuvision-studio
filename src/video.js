/**
 * Silent canvas video export using the same raster animation as live playback.
 * Exports EVVideo/CommonJS; no screen capture, microphone, or server encoder.
 * All internal times are milliseconds. Callers supply a stable slide snapshot.
 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' ? require('./core.js') : root.EVStudio,
    typeof module === 'object' ? require('./execuvision.js') : root.ExecuVision,
  );
  if (typeof module === 'object') {
    module.exports = api;
  }
  root.EVVideo = api;
})(globalThis, function (S, EV) {
  'use strict';
  const MAX_DURATION = 30 * 60 * 1000;
  const MAX_BYTES = 256 * 1024 * 1024;
  const families = [
    {
      id: 'mp4',
      label: 'MP4',
      extension: 'mp4',
      types: ['video/mp4;codecs=avc1.42001f', 'video/mp4'],
    },
    {
      id: 'webm',
      label: 'WebM',
      extension: 'webm',
      types: ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'],
    },
  ];
  // Probe concrete MIME types in preference order; never infer MP4 support from
  // a browser name. Recorder construction can still fail under resource pressure.
  function formats(Recorder = globalThis.MediaRecorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== 'function') {
      return [];
    }
    return families.flatMap((f) => {
      const mime = f.types.find((t) => {
        try {
          return Recorder.isTypeSupported(t);
        } catch {
          return false;
        }
      });
      return mime ? [{ ...f, mime }] : [];
    });
  }

  // Convert UI seconds to contiguous [start, end) timeline entries. When requested,
  // extend a slide through its final motion plus a 500 ms hold at the endpoint.
  function timeline(slides, options = {}) {
    const seconds = Number(options.seconds ?? 10);
    const scale = Number(options.scale ?? 3);
    const fps = Number(options.fps ?? 30);
    if (!Array.isArray(slides) || !slides.length || slides.length > 100) {
      throw Error('Choose 1–100 slides to export.');
    }
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 240) {
      throw Error('Slide time must be between 1 and 240 seconds.');
    }
    if (![1, 2, 3, 4].includes(scale) || ![15, 24, 30, 60].includes(fps)) {
      throw Error('Choose a supported video size and frame rate.');
    }
    let total = 0;
    const entries = slides.map((s, i) => {
      const motions = S.motionList(s).map(S.validateMotion);
      if (motions.length > S.MAX_MOTIONS) {
        throw Error('Too many motions on a slide.');
      }
      const motionEnd = Math.max(0, ...motions.map((m) => m.delay + 11000 - m.speed * 1000));
      const duration = Math.max(
        seconds * 1000,
        options.finishMotions !== false && motionEnd ? motionEnd + 500 : 0,
      );
      const start = total;
      total += duration;
      return { slide: s, index: i, start, duration, end: total };
    });
    if (total > MAX_DURATION) {
      throw Error(
        'Export up to 30 minutes at a time. Reduce the slide time or export the current slide.',
      );
    }
    return { entries, total, scale, fps, width: 320 * scale, height: 200 * scale };
  }

  // A new animation session per slide resets trails. Clamp the end time just
  // inside the final entry so requesting the last frame never selects index -1.
  function renderer(plan) {
    let current = -1;
    let animation;
    return (elapsed) => {
      const t = Math.max(0, Math.min(Number(elapsed) || 0, plan.total - 0.001));
      const i = plan.entries.findIndex((e) => t < e.end);
      const entry = plan.entries[i];
      if (current !== i) {
        current = i;
        animation = S.createAnimation(entry.slide);
      }
      return {
        index: i,
        slide: entry.slide,
        raster: animation.frame(t - entry.start),
        elapsed: t,
        total: plan.total,
      };
    };
  }

  /**
   * Record in real time and resolve only after the final dataavailable/onstop.
   * env supplies browser APIs and is injectable for deterministic recorder tests.
   * Cancellation, hidden tabs, encoder errors, and timeouts share one failure
   * path that discards partial output and releases listeners, timers, and tracks.
   * @returns {Promise<Object>} Blob, MIME/extension, dimensions, duration, and fps.
   */
  function record(
    { slides, options = {}, canvas, onProgress = () => {}, signal },
    env = globalThis,
  ) {
    return new Promise((resolve, reject) => {
      let recorder;
      let stream;
      let raf = 0;
      let startTimer = 0;
      let stopTimer = 0;
      let settled = false;
      let stopping = false;
      let started = false;
      let startedAt = 0;
      let lastDraw = -Infinity;
      let bytes = 0;
      let chunks = [];
      const doc = env.document;
      const clear = () => {
        if (raf) {
          env.cancelAnimationFrame(raf);
        }
        env.clearTimeout(startTimer);
        env.clearTimeout(stopTimer);
        signal?.removeEventListener('abort', abort);
        doc?.removeEventListener('visibilitychange', visibility);
      };
      const stopTracks = () => stream?.getTracks().forEach((t) => t.stop());
      // Recorder callbacks can race with cancellation. Settle once and detach
      // handlers before stopping the encoder, which may itself dispatch events.
      function fail(error) {
        if (settled) {
          return;
        }
        settled = true;
        clear();
        if (recorder) {
          recorder.ondataavailable = recorder.onstop = recorder.onerror = recorder.onstart = null;
          try {
            if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          } catch {}
        }
        stopTracks();
        chunks = [];
        reject(error);
      }
      function abort() {
        const e = new Error('Video export cancelled.');
        e.name = 'AbortError';
        fail(e);
      }
      function visibility() {
        if (doc?.hidden) {
          fail(
            Error(
              'Export stopped because the tab was hidden. Keep this tab visible and try again.',
            ),
          );
        }
      }
      try {
        if (signal?.aborted) {
          abort();
          return;
        }
        const plan = timeline(slides, options);
        const available = formats(env.MediaRecorder);
        const format = available.find((f) => f.id === (options.format || available[0]?.id));
        if (!format || typeof canvas?.captureStream !== 'function') {
          throw Error(
            'This browser cannot record canvas video. Open the app in a browser with MediaRecorder and canvas capture support.',
          );
        }
        if (doc?.hidden) {
          throw Error('Keep this tab visible while exporting video.');
        }
        const frame = renderer(plan);
        const source = doc.createElement('canvas');
        source.width = 320;
        source.height = 200;
        const src = source.getContext('2d');
        canvas.width = plan.width;
        canvas.height = plan.height;
        const dst = canvas.getContext('2d');
        if (!src || !dst) {
          throw Error('Video canvas could not be created.');
        }
        dst.imageSmoothingEnabled = false;
        const draw = (elapsed) => {
          const f = frame(elapsed);
          const p = f.slide.palette;
          src.putImageData(
            new env.ImageData(
              EV.rgba(f.raster, EV.cgaPalette(p.background, p.family, p.intensity)),
              320,
              200,
            ),
            0,
            0,
          );
          dst.drawImage(source, 0, 0, plan.width, plan.height);
          onProgress({
            index: f.index,
            count: plan.entries.length,
            elapsed: Math.min(elapsed, plan.total),
            total: plan.total,
            name: f.slide.name,
          });
        };
        draw(0);
        stream = canvas.captureStream(plan.fps);
        recorder = new env.MediaRecorder(stream, {
          mimeType: format.mime,
          videoBitsPerSecond: Math.max(1000000, Math.min(8000000, plan.width * plan.height * 8)),
        });
        const requestFrame = () => stream.getVideoTracks?.()[0]?.requestFrame?.();
        recorder.ondataavailable = (e) => {
          if (settled || !e.data?.size) {
            return;
          }
          bytes += e.data.size;
          if (bytes > MAX_BYTES) {
            fail(Error('Video exceeded 256 MiB. Export fewer slides or choose a smaller size.'));
            return;
          }
          chunks.push(e.data);
        };
        recorder.onerror = (e) =>
          fail(
            Error(
              e.error?.message ||
                'The browser video encoder failed. Try a smaller size or another format.',
            ),
          );
        // Normal completion waits for stop, not the final scheduled draw: the
        // encoder may deliver its last chunk only after stop() is requested.
        recorder.onstop = () => {
          if (settled) {
            return;
          }
          if (!stopping) {
            fail(Error('Recording stopped before the presentation finished.'));
            return;
          }
          const mime = recorder.mimeType || format.mime;
          const extension = mime.startsWith('video/mp4')
            ? 'mp4'
            : mime.startsWith('video/webm')
              ? 'webm'
              : null;
          if (!extension) {
            fail(Error('The browser returned an unsupported video container.'));
            return;
          }
          const blob = new env.Blob(chunks, { type: mime });
          if (!blob.size) {
            fail(Error('The browser produced an empty video. Try another format.'));
            return;
          }
          settled = true;
          clear();
          stopTracks();
          chunks = [];
          resolve({
            blob,
            mime,
            extension,
            width: plan.width,
            height: plan.height,
            duration: plan.total,
            fps: plan.fps,
          });
        };
        function tick(now) {
          if (settled || stopping) {
            return;
          }
          try {
            const elapsed = Math.max(0, now - startedAt);
            if (elapsed >= plan.total) {
              draw(plan.total);
              requestFrame();
              stopping = true;
              stopTimer = env.setTimeout(
                () => fail(Error('The video encoder did not finish. Try another format.')),
                10000,
              );
              recorder.stop();
              return;
            }
            // Quantize to requested frame slots rather than adding frame delays.
            // This avoids accumulating scheduler drift on irregular RAF timing.
            const frameNumber = Math.floor((elapsed * plan.fps) / 1000);
            if (frameNumber !== lastDraw) {
              draw(elapsed);
              lastDraw = frameNumber;
            }
            raf = env.requestAnimationFrame(tick);
          } catch (e) {
            fail(e);
          }
        }
        // Start the clock on encoder start, not on the button click, so encoder
        // initialization latency does not skip the beginning of the presentation.
        recorder.onstart = () => {
          if (settled) {
            return;
          }
          started = true;
          env.clearTimeout(startTimer);
          startedAt = env.performance.now();
          try {
            draw(0);
            lastDraw = 0;
            requestFrame();
            raf = env.requestAnimationFrame(tick);
          } catch (e) {
            fail(e);
          }
        };
        signal?.addEventListener('abort', abort, { once: true });
        doc?.addEventListener('visibilitychange', visibility);
        startTimer = env.setTimeout(() => {
          if (!started) {
            fail(Error('The video encoder did not start. Try another format.'));
          }
        }, 10000);
        recorder.start(1000);
      } catch (e) {
        fail(e);
      }
    });
  }
  return { formats, timeline, renderer, record, MAX_DURATION, MAX_BYTES };
});
