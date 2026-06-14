# Git Sonar

![Git Sonar logo](public/favicon.svg)

Turn any Git repository into shareable, printable **art** — movie posters, album covers, and generative prints generated from your commit history. Explore the history as an interactive graph, then switch to the **Poster Studio** to design and export. Everything runs in the browser; nothing is uploaded.

[Features](#features) | [Quick Start](#quick-start) | [Usage](#usage) | [Tech Stack](#tech-stack) | [Keyboard Shortcuts](#keyboard-shortcuts)

![Astro](https://img.shields.io/badge/Astro-6.x-purple?logo=astro)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Canvas 2D](https://img.shields.io/badge/Canvas-2D-orange)
![ESLint](https://img.shields.io/badge/ESLint-8.x-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### Poster Studio (git → art)

- **8 poster templates** across four families:
  - **Cinematic** — *Movie One-Sheet* (key-art graph + auto-generated billing block) and *Festival Lineup* (contributors as a tiered bill)
  - **Music** — *Album + Tracklist* (vinyl cover mark + commits as a numbered tracklist)
  - **Generative** — *Flow Field* (Fidenza-style ribbons), *Pulsar* (Unknown-Pleasures joyplot from commit cadence), *Year in Code* (radial year-ring spiral), *Constellation* (star map)
  - **Data** — *Swiss Grid* (International-Typographic data print)
- **Data-driven encodings** — map git signals to visual channels (color by author/lane/time/churn; size by churn/recency/merge; turbulence, density, glow)
- **Perceptual palettes** derived in OKLCH from five curated themes (Night, Dawn, GitHub, Nord, Dracula) + duotone/mono/vivid moods
- **Deterministic + shareable** — every poster is seeded; the config encodes into a `#p=…` link (no server). Links from a **public repo or a demo reproduce the exact poster for anyone**; links from a private/local import restore your settings so you can re-render it yourself
- **Export** — pixel-faithful high-resolution PNG, true-vector SVG, and a print-dimensioned vector PDF (A4–A1, 18×24, 24×36) in sRGB, with an optional print-safe palette. **Fonts are embedded in every output** — base64 `@font-face` in the SVG and registered faces in the PDF — so downloads keep their typography on any machine (the self-hosted TTFs are fetched once at build into `public/fonts/`)
- Live preview, a tasteful slider panel, and a shuffle button for variants

### Graph explorer

- Interactive canvas view of commits, branches, and merges
- Runs entirely in the browser; repositories stay local
- Keyboard-first navigation with search, zoom, and shortcuts
- Screen reader friendly with live region updates and focus management
- Import from GitHub, GitLab, Bitbucket, or a local ZIP
- Lane-based layout keeps branches visually distinct
- LOD rendering and debounced search for large repositories
- Timeline scrubber and calendar view for chronological navigation
- Multiple demo datasets for quick exploration

## Performance

- Spatial indexing and viewport culling keep rendering fast on large repositories
- Level-of-detail rendering simplifies visuals at low zoom
- Batched edge rendering minimizes canvas state changes
- Debounced search and incremental loading reduce UI stalls

## Quick Start

```bash
# Clone repository
git clone https://github.com/JonathanRReed/Git-sonar.git
cd Git-sonar

# Install dependencies
bun install

# Start development server
bun run dev
```

Then open [http://localhost:4321](http://localhost:4321) in your browser.

## Usage

### Import Methods

1. **Demo Repository** — Try the app instantly with bundled sample data (Small, Medium, or Large)
2. **Repository URL** — Paste a public GitHub, GitLab, or Bitbucket URL (optional token for private repos / rate limits)
3. **Upload ZIP** — Create a ZIP of your `.git` folder and drop it in

```bash
# Create a ZIP of your .git folder
cd your-repo && zip -r git-export.zip .git
```

### Exploring Your History

- **Pan** — Click and drag canvas
- **Zoom** — Scroll wheel, `+`/`-` keys, or pinch gesture
- **Reset Zoom** — Press `0` or click reset button
- **Select** — Click on any commit node
- **Details** — Double-click or press Enter for full commit info
- **Search** — Press `/` or use sidebar search to find commits by message, author, or SHA
- **Timeline** — Use timeline scrubber at bottom to navigate chronologically
- **Export** — Click camera icon for PNG or document icon for SVG

### Designing a poster

1. Import a repository (or load a demo).
2. Click **Poster** in the toolbar to open the **Poster Studio**.
3. Pick a template, set the title/subtitle, choose a theme + palette, and tune the encoding sliders.
4. Hit **Shuffle** for generative variants (each is reproducible from its seed).
5. Export a **PNG** (web/social, pixel-faithful), **SVG** (vector), or **PDF** (vector, print-dimensioned), or **Copy link** (a public-repo or demo link reopens the exact poster).

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `↑` `↓` | Navigate between commits in same lane |
| `←` `→` | Navigate to previous/next commit |
| `Enter` | Open commit details dialog |
| `Esc` | Close dialogs / Deselect / Blur from input |
| `/` | Focus search input |
| `?` | Toggle help overlay |
| `+` `=` | Zoom in |
| `-` `_` | Zoom out |
| `0` | Reset zoom to 100% |

## Tech Stack

| Technology | Purpose |
| --- | --- |
| [Astro](https://astro.build) | Static site framework |
| [React](https://react.dev) | Interactive UI islands |
| [Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | High-performance graph rendering with LOD |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first styling |
| [Zustand](https://zustand-demo.pmnd.rs/) | Lightweight state management |
| [fflate](https://github.com/101arrowz/fflate) | In-browser ZIP/.git parsing |
| [culori](https://culorijs.org/) | OKLCH palette engine |
| [resvg + sharp](https://github.com/yisibl/resvg-js) | Build-time poster rasterization |

## Project Structure

```text
git-sonar/
├── src/
│   ├── components/       # React components
│   │   ├── PosterStudio.tsx        # Poster Studio — the art editor
│   │   ├── GraphCanvas.tsx         # Inspect-mode canvas visualization with LOD
│   │   ├── ImportPanel.tsx         # Import with multiple demo options
│   │   ├── CommitDetailsDialog.tsx  # Commit details modal
│   │   ├── ControlsOverlay.tsx      # Keyboard shortcuts & export
│   │   ├── TimelineScrubber.tsx   # Timeline navigation
│   │   ├── LiveRegion.tsx         # Screen reader announcements
│   │   ├── LoadingSkeleton.tsx     # Loading states
│   │   └── ErrorBoundary.tsx       # Error handling
│   ├── lib/
│   │   ├── git/                  # Git parsing utilities
│   │   ├── store/                # Zustand store
│   │   ├── demo-data/            # Sample Git histories
│   │   └── utils/                # Helper functions (formatting, color, debounce)
│   ├── pages/
│   │   ├── index.astro            # Landing page
│   │   └── app.astro              # Main application
│   └── styles/                  # Global CSS + component styles
├── public/                      # Static assets
└── tests/                       # Unit tests (Vitest)
```

## Color Theme

Git Sonar uses beautiful [Rosé Pine](https://rosepinetheme.com/) color palette:

- **Foam** `#8fd3c7` — Primary accents
- **Iris** `#c8b58a` — Secondary/merge commits
- **Gold** `#f2b36d` — Feature branches
- **Love** `#d86f61` — Highlights
- **Rose** `#d6a49b` — Tertiary elements
- **Pine** `#29423d` — Additional lanes

## Development

### Linting

```bash
# Run ESLint
bun run lint

# Auto-fix issues
bun run lint:fix
```

### Building

```bash
# Create production build
bun run build

# Preview production build
bun run preview
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Run linting (`bun run lint`)
5. Push to your branch (`git push origin feature/amazing`)
6. Open a Pull Request

### Code Style

- Use TypeScript for type safety
- Follow existing code conventions
- Add JSDoc comments for public APIs
- Test new features when applicable
- Run `bun run lint:fix` before committing

## License

MIT. See [`LICENSE`](./LICENSE).

---
