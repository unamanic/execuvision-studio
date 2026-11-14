// Presentation timeline and browser MediaRecorder export, with cancellation and cleanup.
/* Local, silent canvas video export. No screen capture, network, or external codec. */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' ? require('./core.js') : root.EVStudio,
    typeof module === 'object' ? require('./execuvision.js') : root.ExecuVision,
  );
  if (typeof module === 'object') module.exports = api;
  root.EVVideo = api;
})(globalThis, function (S, EV) {
  'use strict';
  const MAX_DURATION = 30 * 60 * 1000,
    MAX_BYTES = 256 * 1024 * 1024;
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
  function formats(Recorder = globalThis.MediaRecorder) {
    if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return [];
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
  function timeline(slides, options = {}) {
    const seconds = Number(options.seconds ?? 10),
      scale = Number(options.scale ?? 3),
      fps = Number(options.fps ?? 30);
    if (!Array.isArray(slides) || !slides.length || slides.length > 100)
      throw Error('Choose 1–100 slides to export.');
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 240)
      throw Error('Slide time must be between 1 and 240 seconds.');
    if (![1, 2, 3, 4].includes(scale) || ![15, 24, 30, 60].includes(fps))
      throw Error('Choose a supported video size and frame rate.');
    let total = 0;
    const entries = slides.map((s, i) => {
      const motions = S.motionList(s).map(S.validateMotion);
      if (motions.length > S.MAX_MOTIONS) throw Error('Too many motions on a slide.');
      const motionEnd = Math.max(0, ...motions.map((m) => m.delay + 11000 - m.speed * 1000));
      const duration = Math.max(
          seconds * 1000,
          options.finishMotions !== false && motionEnd ? motionEnd + 500 : 0,
        ),
        start = total;
      total += duration;
      return { slide: s, index: i, start, duration, end: total };
    });
    if (total > MAX_DURATION)
      throw Error(
        'Export up to 30 minutes at a time. Reduce the slide time or export the current slide.',
      );
    return { entries, total, scale, fps, width: 320 * scale, height: 200 * scale };
  }
  function renderer(plan) {
    let current = -1,
      animation;
    return (elapsed) => {
      const t = Math.max(0, Math.min(Number(elapsed) || 0, plan.total - 0.001)),
        i = plan.entries.findIndex((e) => t < e.end),
        entry = plan.entries[i];
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
  function record(
    { slides, options = {}, canvas, onProgress = () => {}, signal },
    env = globalThis,
  ) {
    return new Promise((resolve, reject) => {
      let recorder,
        stream,
        raf = 0,
        startTimer = 0,
        stopTimer = 0,
        settled = false,
        stopping = false,
        started = false,
        startedAt = 0,
        lastDraw = -Infinity,
        bytes = 0,
        chunks = [];
      const doc = env.document,
        clear = () => {
          if (raf) env.cancelAnimationFrame(raf);
          env.clearTimeout(startTimer);
          env.clearTimeout(stopTimer);
          signal?.removeEventListener('abort', abort);
          doc?.removeEventListener('visibilitychange', visibility);
        };
      const stopTracks = () => stream?.getTracks().forEach((t) => t.stop());
      function fail(error) {
        if (settled) return;
        settled = true;
        clear();
        if (recorder) {
          recorder.ondataavailable = recorder.onstop = recorder.onerror = recorder.onstart = null;
          try {
            if (recorder.state !== 'inactive') recorder.stop();
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
        if (doc?.hidden)
          fail(
            Error(
              'Export stopped because the tab was hidden. Keep this tab visible and try again.',
            ),
          );
      }
      try {
        if (signal?.aborted) {
          abort();
          return;
        }
        const plan = timeline(slides, options),
          available = formats(env.MediaRecorder),
          format = available.find((f) => f.id === (options.format || available[0]?.id));
        if (!format || typeof canvas?.captureStream !== 'function')
          throw Error(
            'This browser cannot record canvas video. Open the app in a browser with MediaRecorder and canvas capture support.',
          );
        if (doc?.hidden) throw Error('Keep this tab visible while exporting video.');
        const frame = renderer(plan),
          source = doc.createElement('canvas');
        source.width = 320;
        source.height = 200;
        const src = source.getContext('2d');
        canvas.width = plan.width;
        canvas.height = plan.height;
        const dst = canvas.getContext('2d');
        if (!src || !dst) throw Error('Video canvas could not be created.');
        dst.imageSmoothingEnabled = false;
        const draw = (elapsed) => {
          const f = frame(elapsed),
            p = f.slide.palette;
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
          if (settled || !e.data?.size) return;
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
        recorder.onstop = () => {
          if (settled) return;
          if (!stopping) {
            fail(Error('Recording stopped before the presentation finished.'));
            return;
          }
          const mime = recorder.mimeType || format.mime,
            extension = mime.startsWith('video/mp4')
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
          if (settled || stopping) return;
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
        recorder.onstart = () => {
          if (settled) return;
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
          if (!started) fail(Error('The video encoder did not start. Try another format.'));
        }, 10000);
        recorder.start(1000);
      } catch (e) {
        fail(e);
      }
    });
  }
  return { formats, timeline, renderer, record, MAX_DURATION, MAX_BYTES };
});
