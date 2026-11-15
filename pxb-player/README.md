# PixelBanner (`.pxb`) & PixelImage (`.pxi`) Web Player — Public Beta (v0.1.0)

**Author:** [@BjornEriksson](https://github.com)  
**Version:** `0.1.0-beta`

**`pxb-player.js`** is a lightweight, zero-dependency JavaScript player that renders binary **`.pxi` (PixelImage)** still images and **`.pxb` (PixelBanner)** animations directly inside standard HTML `<canvas>` elements—just like regular images and animated GIFs.

---

## Live Preview (`example/movie.mp4`)

https://github.com/user-attachments/assets/a7d86bf3-6b40-44b5-95ee-0dea7d27112e

---

## Key Features

* **Zero Dependencies:** Single standalone file (`pxb-player.js`) with built-in binary decoding—no external libraries or helper scripts required.
* **Full Multi-Depth Color Support:** Decodes all 5 palette modes (`8-bit VGA 256`, `9-bit RGB 512`, `12-bit Amiga 4,096`, `16-bit RGB565`, and `24-bit True Color`) plus Auto-RLE compression (`flags & 0x02`).
* **Self-Describing Inner-Gap Raster Rendering:** Automatically reads `gridWidth`, `gridHeight`, `pixelScale`, `rasterStyle`, `rasterThickness`, and `rasterColor` from the 16-byte Big-Endian header.
* **Interactive Hover & Focus Swapping:** Seamlessly swap between a static `.pxi` button state and a looping `.pxb` animation on pointer hover or keyboard focus (`data-pxb-hover`).
* **Smart Caching & Off-Screen Pausing:** Deduplicates network requests via an in-memory `Map` cache and pauses off-screen loops automatically with `IntersectionObserver`.

---

## Quick Start

1. Include `pxb-player.js` in your HTML `<head>`:
   ```html
   <script src="pxb-player.js" defer></script>
   ```
2. Add `<canvas>` tags pointing to your `.pxi` or `.pxb` files:
   ```html
   <!-- Static .pxi image -->
   <canvas data-pxi="example/btn-artwork-idle.pxi"></canvas>

   <!-- Looping .pxb animation -->
   <canvas data-pxb="example/btn-artwork-hover.pxb"></canvas>

   <!-- Interactive link button (.pxi idle -> .pxb hover animation) -->
   <a href="#artwork" aria-label="Artwork Gallery">
     <canvas
       data-pxi="example/btn-artwork-idle.pxi"
       data-pxb-hover="example/btn-artwork-hover.pxb">
     </canvas>
   </a>
   ```
3. Optional: Override the file's built-in display scale using `data-scale="3"`.

---

## Project Structure

```text
pxb-player/
├── pxb-player.js              # Standalone zero-dependency player
├── README.md                  # Documentation and usage examples
└── example/
    ├── player-example.html    # Live HTML test page
    ├── btn-artwork-idle.pxi   # Sample 9-bit static button (.pxi)
    ├── btn-artwork-hover.pxb  # Sample 6-frame hover animation (.pxb)
    └── movie.mp4              # Video preview of the player in action
```

---

## Ecosystem Roadmap

This repository is part of a modular suite of pixel tools by [@BjornEriksson](https://github.com):
* **PixelImage (`.pxi`) Studio** — Single-frame pixel editor and `.pxi` encoder/decoder.
* **PixelBanner (`.pxb`) Animator** — Folder-based timeline assembler for multi-frame animated `.pxb` banners and loops.
* **PixelBanner & PixelImage Web Player (`pxb-player.js`)** *(Current Beta v0.1.0)* — Drop-in browser renderer for `.pxi` and `.pxb` graphics.

---

## License

This project is licensed under the [MIT License](LICENSE).
