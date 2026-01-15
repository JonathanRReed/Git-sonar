# Git Sonar

![Git Sonar logo](public/favicon.svg)

Visualize your Git history as a clean, interactive graph.

[Features](#features) | [Quick Start](#quick-start) | [Usage](#usage) | [Tech Stack](#tech-stack) | [Keyboard Shortcuts](#keyboard-shortcuts)

![Astro](https://img.shields.io/badge/Astro-5.x-purple?logo=astro)
![React](https://img.shields.io/badge/React-19-blue?logo=react)
![Canvas 2D](https://img.shields.io/badge/Canvas-2D-orange)
![ESLint](https://img.shields.io/badge/ESLint-9.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

- Interactive canvas view of commits, branches, and merges
- Runs entirely in the browser; repositories stay local
- Keyboard-first navigation with search, zoom, and shortcuts
- Screen reader friendly with live region updates and focus management
- Import from GitHub, GitLab, Bitbucket, or a local ZIP
- Lane-based layout keeps branches visually distinct
- LOD rendering and debounced search for large repositories
- Responsive layout with a collapsible sidebar
- Export the graph as PNG or SVG
- Timeline scrubber for chronological navigation
- Multiple demo datasets for quick exploration

## Performance

- Spatial indexing and viewport culling keep rendering fast on large repositories
- Level-of-detail rendering simplifies visuals at low zoom
- Batched edge rendering minimizes canvas state changes
- Debounced search and incremental loading reduce UI stalls

## Quick Start

```bash
# Clone repository
git clone https://github.com/git-sonar/git-sonar.git
cd git-sonar

# Install dependencies
bun install

# Start development server
bun run dev
```

Then open [http://localhost:4321](http://localhost:4321) in your browser.

## Usage

### Import Methods

1. **Demo Repository** — Try app instantly with bundled sample data (Simple, Branching, or Complex)
2. **Open Folder** — Select your project folder directly (Chrome/Edge only)
3. **Upload ZIP** — Create a ZIP of your `.git` folder and upload it

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
| [isomorphic-git](https://isomorphic-git.org/) | In-browser Git parsing |
| [fflate](https://github.com/101arrowz/fflate) | Fast ZIP decompression |

## Project Structure

```text
git-sonar/
├── src/
│   ├── components/       # React components
│   │   ├── GraphCanvas.tsx         # Main canvas visualization with LOD
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

- **Foam** `#9ccfd8` — Primary accents
- **Iris** `#c4a7e7` — Secondary/merge commits
- **Gold** `#f6c177` — Feature branches
- **Love** `#eb6f92` — Highlights
- **Rose** `#ebbcba` — Tertiary elements
- **Pine** `#31748f` — Additional lanes

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

MIT © 2026 Git Sonar

---
