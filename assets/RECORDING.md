# Demo GIF/Video Recording Guide

## Tools

- **VHS** (Charmbracelet) — scripted terminal recordings → GIF/MP4
- Install: `brew install vhs`

## Available Tapes

| Tape | Output | LLM needed? | Duration |
|------|--------|-------------|----------|
| `demo-score-only.tape` | `demo-score.gif` + `.mp4` | No | ~18s |
| `demo.tape` | `demo.gif` + `.mp4` | Yes | ~90s |

## Quick Start

```bash
# 1. Set up the demo repo (TypeScript + React + Hono project)
./assets/demo-setup.sh

# 2. Build caliber (if not globally installed)
pnpm run build && npm link

# 3. Record the score-only GIF (no API key needed)
vhs assets/demo-score-only.tape

# 4. For the full demo, set your API key first
export ANTHROPIC_API_KEY=sk-ant-...
vhs assets/demo.tape
```

## Demo Flow

### Score-Only GIF (recommended for README hero image)

Shows `caliber score` on a project with a minimal hand-written CLAUDE.md.
Result: **47/100 Grade D** with clear breakdown of what's missing.
No API key required, fast to record, small file size (~400KB).

### Full Demo (for linked video)

Three acts:

1. **Score** — `caliber score` shows 47/100 Grade D
2. **Init** — `caliber init` generates tailored configs (ASCII art, parallel engine, review)
3. **Score again** — `caliber score` shows 90+/100 Grade A

## Recording Settings That Work

Through testing, these VHS settings produce clean output:

```
Set Shell "bash"          # zsh prompts can cause issues
Set FontSize 12           # small enough to fit 65+ lines
Set Width 900             # keeps lines from wrapping
Set Height 1100           # tall enough for full score output (~65 lines)
Set Theme "Catppuccin Mocha"  # dark theme, good contrast with caliber colors
```

**Don't set FontFamily** — VHS uses a headless browser and custom fonts may
not be available, which can cause hangs or fallback to a wide monospace font
that wraps text.

Suppress the update banner:
```
export CALIBER_SKIP_UPDATE_CHECK=1
```

## Timing the Interactive Init

The `demo.tape` has approximate timings for `caliber init`. To get accurate timings:

1. **Manual recording**: `vhs record assets/demo-manual.tape`
2. Copy timings from the manual recording into `demo.tape`
3. Re-record: `vhs assets/demo.tape`

## Optimizing Output Size

```bash
# Optimize GIF with gifsicle
gifsicle -O3 --lossy=80 assets/demo.gif -o assets/demo.gif

# Or use ffmpeg for smaller GIF
ffmpeg -i assets/demo.mp4 -vf "fps=15,scale=800:-1" -gifflags +transdiff assets/demo.gif
```

## Remotion README hero (`assets/demo-header.gif`)

The marketing GIF is authored under `assets/video/` (composition **CaliberDemo**). It is **not** produced by VHS.

1. **MP4 master** (full quality, good for LinkedIn / uploads):

   ```bash
   cd assets/video && pnpm install && pnpm run build
   ```

   Output: `assets/video/assets/demo.mp4`.

2. **README GIF** (default pipeline targets smaller files — scale + frame skip):

   ```bash
   cd assets/video && pnpm run build:readme-gif
   ```

   Writes `assets/demo-header.gif`, then runs `scripts/optimize-gif.sh` if `gifsicle` is installed.

3. **ffmpeg from MP4** (alternative palette GIF):

   ```bash
   ffmpeg -y -i assets/video/assets/demo.mp4 -vf "fps=12,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse" assets/demo-header.gif
   ```

Aim for **under ~8MB** for GitHub README load times; tighten `--scale`, `--every-nth-frame`, or gifsicle `--lossy` if the file grows.

## Using in the README

The `demo-score.gif` is the primary README visual. The full `demo.mp4` can be
uploaded to YouTube/Loom and linked from the README for viewers who want the
complete workflow.

To replace the current demo.gif in the README:
```bash
cp assets/demo-score.gif assets/demo.gif
```
