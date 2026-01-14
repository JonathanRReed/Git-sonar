<p align="center">
  <img src="public/favicon.svg" alt="Git Sonar Logo" width="80" height="80">
</p>

<h1 align="center">Git Sonar</h1>

<p align="center">
  <strong>Visualize your Git history as a beautiful interactive graph</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage">Usage</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#keyboard-shortcuts">Keyboard Shortcuts</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Astro-5.x-purple?logo=astro" alt="Astro">
  <img src="https://img.shields.io/badge/React-19-blue?logo=react" alt="React">
  <img src="https://img.shields.io/badge/Canvas-2D-orange" alt="Canvas 2D">
  <img src="https://img.shields.io/badge/ESLint-9.0-blue" alt="ESLint">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
</p>

---

## ✨ Features

- **🎨 Beautiful Visualization** — See commits, branches, and merges as an interactive 2D canvas graph with smooth animations
- **🔒 100% Private** — Everything runs in your browser. Your code never leaves your machine
- **⌨️ Keyboard-First** — Navigate with arrow keys, search with `/`, zoom with `+`/`-`, get help with `?`
- **♿ Accessible** — Screen reader friendly with ARIA live regions, focus management, and ErrorBoundary
- **📦 No Setup Required** — Import directly from your `.git` folder or drop a ZIP file
- **🎯 Smart Layout** — Automatic lane-based positioning keeps branches visually distinct
- **⚡ Optimized Performance** — LOD rendering, debounced search, efficient canvas updates
- **📱 Mobile Responsive** — Collapsible sidebar, touch-friendly controls, responsive design
- **🎬 Export Options** — Export as PNG or SVG for sharing and presentations
- **⏱️ Timeline Scrubber** — Navigate through commit history chronologically
- **📚 Multiple Demo Datasets** — Simple, branching, and complex histories to explore
- **🎨 Enhanced Styling** — Improved branch labels, tooltips, loading skeletons

## 🚀 Quick Start

```bash
# Clone repository
git clone https://github.com/git-sonar/git-sonar.git
cd git-sonar

# Install dependencies
npm install

# Start development server
npm run dev
```

Then open [http://localhost:4321](http://localhost:4321) in your browser.

## 📖 Usage

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

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate between commits in same lane |
| `←` `→` | Navigate to previous/next commit |
| `Enter` | Open commit details dialog |
| `Esc` | Close dialogs / Deselect / Blur from input |
| `/` | Focus search input |
| `?` | Toggle help overlay |
| `+` `=` | Zoom in |
| `-` `_` | Zoom out |
| `0` | Reset zoom to 100% |

## 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| [Astro](https://astro.build) | Static site framework |
| [React](https://react.dev) | Interactive UI islands |
| [Canvas 2D](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API) | High-performance graph rendering with LOD |
| [Tailwind CSS](https://tailwindcss.com) | Utility-first styling |
| [Zustand](https://zustand-demo.pmnd.rs/) | Lightweight state management |
| [isomorphic-git](https://isomorphic-git.org/) | In-browser Git parsing |
| [fflate](https://github.com/101arrowz/fflate) | Fast ZIP decompression |

## 📁 Project Structure

```
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

## 🎨 Color Theme

Git Sonar uses beautiful [Rosé Pine](https://rosepinetheme.com/) color palette:

- **Foam** `#9ccfd8` — Primary accents
- **Iris** `#c4a7e7` — Secondary/merge commits
- **Gold** `#f6c177` — Feature branches
- **Love** `#eb6f92` — Highlights
- **Rose** `#ebbcba` — Tertiary elements
- **Pine** `#31748f` — Additional lanes

## 🔧 Development

### Linting
```bash
# Run ESLint
npm run lint

# Auto-fix issues
npm run lint:fix
```

### Building
```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Run linting (`npm run lint`)
5. Push to your branch (`git push origin feature/amazing`)
6. Open a Pull Request

### Code Style
- Use TypeScript for type safety
- Follow existing code conventions
- Add JSDoc comments for public APIs
- Test new features when applicable
- Run `npm run lint:fix` before committing

## 📄 License

MIT © 2026 Git Sonar

---

<p align="center">
  Made with ❤️ for developers who love understanding their Git history
</p>
