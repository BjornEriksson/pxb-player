/**
 * PixelBanner (.pxb) & PixelImage (.pxi) Standalone Web Player
 * Zero-dependency browser renderer supporting 8/9/12/16/24-bit palettes,
 * Auto-RLE compression, inner-gap raster grids, and interactive hover states.
 *
 * @file pxb-player.js
 * @author BjornEriksson (https://github.com)
 * @version 0.1.0-beta
 * @license MIT
 */
const PxbPlayer = (() => {
  // In-memory asset cache so identical icons/banners only fetch and decode once
  const fileCache = new Map();

  // Deterministic classic 256-color VGA Mode 13h palette table (0xRRGGBB)
  const VGA_256 = (() => {
    const pal = new Uint32Array(256);

    // 0-15: Standard 16 CGA/EGA colors
    const ega16 = [
      0x000000, 0x0000AA, 0x00AA00, 0x00AAAA, 0xAA0000, 0xAA00AA, 0xAA5500, 0xAAAAAA,
      0x555555, 0x5555FF, 0x55FF55, 0x55FFFF, 0xFF5555, 0xFF55FF, 0xFFFF55, 0xFFFFFF
    ];
    for (let i = 0; i < 16; i++) pal[i] = ega16[i];

    // 16-31: 16-step grayscale ramp
    for (let i = 0; i < 16; i++) {
      const v = Math.round((i * 255) / 15);
      pal[16 + i] = (v << 16) | (v << 8) | v;
    }

    // 32-247: 216-color RGB cube (6 x 6 x 6)
    let idx = 32;
    for (let r = 0; r < 6; r++) {
      for (let g = 0; g < 6; g++) {
        for (let b = 0; b < 6; b++) {
          pal[idx++] =
            (Math.round((r * 255) / 5) << 16) |
            (Math.round((g * 255) / 5) << 8) |
            Math.round((b * 255) / 5);
        }
      }
    }

    // 248-255: 8 deep shadow and accent tones
    const extra8 = [0x140000, 0x001400, 0x000014, 0x141400, 0x140014, 0x001414, 0x281400, 0x101018];
    for (let i = 0; i < 8; i++) pal[248 + i] = extra8[i];

    return pal;
  })();

  /**
   * Unpack a raw binary pixel value into a 24-bit RGB integer based on paletteMode.
   * Modes: 0 = 9-bit RGB, 1 = 12-bit Amiga, 2 = 24-bit True Color, 3 = 8-bit VGA, 4 = 16-bit RGB565
   */
  function decodePixel(val, mode) {
    if (mode === 3) return VGA_256[val & 0xFF];
    if (mode === 0) {
      const r = Math.round(((val >> 6) & 7) * 255 / 7);
      const g = Math.round(((val >> 3) & 7) * 255 / 7);
      const b = Math.round((val & 7) * 255 / 7);
      return (r << 16) | (g << 8) | b;
    }
    if (mode === 1) {
      return (((val >> 8) & 15) * 17 << 16) | (((val >> 4) & 15) * 17 << 8) | ((val & 15) * 17);
    }
    if (mode === 4) {
      const r = Math.round(((val >> 11) & 31) * 255 / 31);
      const g = Math.round(((val >> 5) & 63) * 255 / 63);
      const b = Math.round((val & 31) * 255 / 31);
      return (r << 16) | (g << 8) | b;
    }
    return val & 0xFFFFFF;
  }

  function toCss(rgb24) {
    return `rgb(${(rgb24 >> 16) & 0xFF}, ${(rgb24 >> 8) & 0xFF}, ${rgb24 & 0xFF})`;
  }

  /**
   * Parse the 16-byte Big-Endian header and decode raw or RLE pixel frames.
   */
  function decodeBinary(buffer) {
    const view = new DataView(buffer);
    if (view.byteLength < 16 || view.getUint8(0) !== 0x50 || view.getUint8(1) !== 0x58) {
      throw new Error('Invalid .pxi/.pxb signature');
    }

    const kind = view.getUint8(2);
    if (kind !== 0x49 && kind !== 0x42) {
      throw new Error('Unsupported format magic byte');
    }
    const isAnimation = (kind === 0x42); // 'B' = PXB animation, 'I' = PXI still image

    const gridWidth = view.getUint16(4, false);
    const gridHeight = view.getUint16(6, false);
    const pixelScale = view.getUint8(8);
    const rasterStyle = view.getUint8(9);
    const rawRaster = view.getUint16(10, false);
    const paletteMode = view.getUint8(12);
    const frameCount = isAnimation ? view.getUint8(13) : 1;
    const rasterThickness = view.getUint8(14);
    const flags = view.getUint8(15);

    const loop = isAnimation ? ((flags & 0x01) !== 0) : false;
    const isRle = (flags & 0x02) !== 0;

    // 24-bit mode stores rasterColor using 9-bit encoding in the 16-byte header
    const rasterMode = (paletteMode === 2) ? 0 : paletteMode;
    const rasterColor24 = decodePixel(rawRaster, rasterMode);

    const pixelCount = gridWidth * gridHeight;
    const bytesPerPixel = (paletteMode === 3) ? 1 : (paletteMode === 2 ? 3 : 2);
    let offset = 16;

    const readPixel = () => {
      let rawVal = 0;
      if (bytesPerPixel === 1) {
        rawVal = view.getUint8(offset);
      } else if (bytesPerPixel === 2) {
        rawVal = view.getUint16(offset, false);
      } else {
        rawVal =
          (view.getUint8(offset) << 16) |
          (view.getUint8(offset + 1) << 8) |
          view.getUint8(offset + 2);
      }
      offset += bytesPerPixel;
      return decodePixel(rawVal, paletteMode);
    };

    const frames = [];
    for (let f = 0; f < frameCount; f++) {
      const delayMs = isAnimation ? view.getUint16(offset, false) : 0;
      if (isAnimation) offset += 2;

      const pixels = new Uint32Array(pixelCount);
      if (isRle) {
        let written = 0;
        while (written < pixelCount && offset < buffer.byteLength) {
          const run = view.getUint8(offset++);
          const col24 = readPixel();
          for (let r = 0; r < run && written < pixelCount; r++) {
            pixels[written++] = col24;
          }
        }
      } else {
        for (let i = 0; i < pixelCount; i++) {
          pixels[i] = readPixel();
        }
      }
      frames.push({ pixels, delayMs });
    }

    return {
      gridWidth,
      gridHeight,
      pixelScale,
      rasterStyle,
      rasterThickness,
      rasterColor24,
      loop,
      frames
    };
  }

  /**
   * Fetch and cache a decoded .pxi or .pxb asset by URL.
   */
  async function loadAsset(url) {
    if (fileCache.has(url)) return fileCache.get(url);
    const promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
        return res.arrayBuffer();
      })
      .then((buf) => decodeBinary(buf));
    fileCache.set(url, promise);
    return promise;
  }

  /**
   * Render a single frame onto a target <canvas> using inner-gap raster math.
   */
  function renderFrame(canvas, asset, frameIndex, scaleOverride) {
    const scale = scaleOverride || asset.pixelScale || 1;
    const t = (asset.rasterStyle !== 0)
      ? Math.round(asset.rasterThickness * (scale / (asset.pixelScale || 1)))
      : 0;
    const gapX = (asset.rasterStyle === 1 || asset.rasterStyle === 3) ? t : 0;
    const gapY = (asset.rasterStyle === 1 || asset.rasterStyle === 2) ? t : 0;
    const stepX = scale + gapX;
    const stepY = scale + gapY;

    const w = Math.max(1, asset.gridWidth * stepX - gapX);
    const h = Math.max(1, asset.gridHeight * stepY - gapY);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    if (asset.rasterStyle !== 0 && t > 0) {
      ctx.fillStyle = toCss(asset.rasterColor24);
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }

    const pixels = asset.frames[frameIndex].pixels;
    for (let y = 0; y < asset.gridHeight; y++) {
      for (let x = 0; x < asset.gridWidth; x++) {
        ctx.fillStyle = toCss(pixels[y * asset.gridWidth + x]);
        ctx.fillRect(x * stepX, y * stepY, scale, scale);
      }
    }
  }

  /**
   * Bind playback, viewport visibility observer, and hover state swapping to a <canvas>.
   */
  function attachCanvas(canvas) {
    if (canvas._pxbAttached) return;
    canvas._pxbAttached = true;
    canvas.style.imageRendering = 'pixelated';

    const idleUrl = canvas.dataset.pxb || canvas.dataset.pxi;
    const hoverUrl = canvas.dataset.pxbHover || canvas.dataset.pxiHover;
    const scaleOverride = canvas.dataset.scale ? Number(canvas.dataset.scale) : null;

    let timer = null;
    let currentAsset = null;
    let frameIdx = 0;
    let isVisible = true;
    let isHovering = false;

    const stopLoop = () => {
      clearTimeout(timer);
      timer = null;
    };

    const playAsset = (asset) => {
      stopLoop();
      currentAsset = asset;
      frameIdx = 0;
      renderFrame(canvas, asset, 0, scaleOverride);

      if (asset.frames.length > 1) {
        const tick = () => {
          if (!isVisible || currentAsset !== asset) return;
          const delay = Math.max(10, asset.frames[frameIdx].delayMs || 100);
          timer = setTimeout(() => {
            if (!isVisible || currentAsset !== asset) return;
            const next = frameIdx + 1;
            if (next >= asset.frames.length) {
              if (!asset.loop) return;
              frameIdx = 0;
            } else {
              frameIdx = next;
            }
            renderFrame(canvas, asset, frameIdx, scaleOverride);
            tick();
          }, delay);
        };
        tick();
      }
    };

    const showIdle = () => {
      if (!idleUrl) return;
      loadAsset(idleUrl)
        .then((asset) => { if (!isHovering) playAsset(asset); })
        .catch((err) => console.warn(err));
    };

    const showHover = () => {
      if (!hoverUrl) return;
      loadAsset(hoverUrl)
        .then((asset) => { if (isHovering) playAsset(asset); })
        .catch((err) => console.warn(err));
    };

    // Automatically pause off-screen animations to save CPU
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        isVisible = entries.isIntersecting;
        if (isVisible && currentAsset && currentAsset.frames.length > 1 && !timer) {
          playAsset(currentAsset);
        } else if (!isVisible) {
          stopLoop();
        }
      });
      obs.observe(canvas);
    }

    // Bind interactive hover/focus swap when data-pxb-hover or data-pxi-hover is present
    if (hoverUrl) {
      loadAsset(hoverUrl).catch(() => {});

      const triggerEl = canvas.closest('a, button') || canvas;
      triggerEl.addEventListener('pointerenter', () => {
        isHovering = true;
        showHover();
      });
      triggerEl.addEventListener('pointerleave', () => {
        isHovering = false;
        showIdle();
      });
      triggerEl.addEventListener('focus', () => {
        isHovering = true;
        showHover();
      });
      triggerEl.addEventListener('blur', () => {
        isHovering = false;
        showIdle();
      });
    }

    showIdle();
  }

  /**
   * Scan the DOM for <canvas data-pxi> and <canvas data-pxb> elements.
   */
  function initAll(root = document) {
    root.querySelectorAll('canvas[data-pxi], canvas[data-pxb]').forEach(attachCanvas);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }

  return { initAll, attachCanvas, loadAsset };
})();
