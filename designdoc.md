# Git Sonar Design Doc (v2 - 2D Canvas)

Accessible, keyboard-first Git history visualizer with a clean 2D lane-based layout, built as a static Astro site with React islands.

## 1) Goals

**Primary goals:**
- Visualize commit history and branching structure in a clear, readable, vertical layout
- Keyboard-first navigation and screen-reader friendly
- Runs as a static site (no server required)
- Supports three import modes:
  1. Git hosting URL import (GitHub/GitLab/Bitbucket)
  2. ZIP upload of .git folder
  3. Small demo datasets bundled with the site
- Poster‑ready exports (SVG + PDF) with size presets
- Multiple themes for developer and art workflows
- Teaching mode to onboard dev + art audiences

**Non-goals:**
- Full fidelity Git operations (checkout, diffs)
- Server‑side processing or storage
- 3D rendering (2D for clarity)

## 2) Target Users
- Students learning Git who need a clearer alternative to `git log --graph`
- Engineers who want a quick mental model of history shape
- Portfolio / generative-art audiences who want pretty exports

## 3) Tech Stack
- **Framework:** Astro (static build, islands)
- **UI:** React (islands only)
- **Visualization:** Canvas 2D API (scalable to 10k+ commits)
- **Styling:** Tailwind + theme tokens (Rosé Pine, GitHub Dark, Nord, Dracula)
- **Data:** In-browser parsing with isomorphic-git + hosting APIs
- **State:** Zustand

## 4) Visualization Design

### Layout: Vertical Lane-Based Graph
```
Time ↓
┌─────────────────────────────────────────┐
│ ● main   ● feature-x   ● feature-y      │ ← Branch labels
├─────────────────────────────────────────┤
│ ●────────────────────────────────────── │ Newest commit
│ │                                        │
│ ●────────●──────────────────────────── │ Merge
│ │        │                               │
│ │        ●───────────────────────────── │ Feature commit
│ │        │                               │
│ ●────────┘                               │ Branch point
│ │                                        │
│ ●────────────────────────────────────── │ Oldest visible
└─────────────────────────────────────────┘
```

### Key Visual Elements
1. **Lanes**: Each branch gets a stable vertical lane
2. **Nodes**: 
   - Circle (●) = regular commit
   - Hexagon (⬡) = merge commit  
   - Diamond (◆) = root commit
3. **Edges**: Curved bezier lines connecting parent→child
4. **Branch labels**: Floating labels at branch heads
5. **Commit tooltip**: Shows message, author, SHA on hover/select

### Color Scheme (Rosé Pine)
- Lane 1: Foam (#9ccfd8)
- Lane 2: Iris (#c4a7e7) 
- Lane 3: Gold (#f6c177)
- Lane 4: Love (#eb6f92)
- Lane 5: Rose (#ebbcba)
- Lane 6: Pine (#31748f)

### Interaction
- **Pan**: Click and drag canvas
- **Zoom**: Scroll wheel
- **Select**: Click on commit node
- **Details**: Double-click or Enter opens modal
- **Navigate**: Arrow keys move between commits

## 5) Import Methods

### 5.1 Git Hosting URL Import (Recommended)
Import public repos from:
- GitHub
- GitLab
- Bitbucket

Supports optional access tokens for rate limits/private repos (opt‑in storage).

### 5.2 ZIP Upload
User creates ZIP of .git folder:
```bash
cd your-repo && zip -r git-export.zip .git
```
Uses fflate for in-browser decompression, isomorphic-git for parsing.

### 5.3 Demo Data
Bundled sample repos for instant exploration.

## 6) Data Model

```typescript
interface CommitNode {
  id: string;           // SHA
  parents: string[];    // Parent SHAs
  authorName: string;
  authoredAt: number;   // Unix ms
  messageSubject: string;
  branchHints?: string[];
}

interface RepoGraph {
  commits: Map<string, CommitNode>;
  heads: Map<string, string>;  // branch → SHA
  topoOrder: string[];
  lanes: Map<string, number>;  // SHA → lane index
}
```

## 7) Accessibility

- Full keyboard navigation (arrows, Enter, Esc, ?)
- ARIA live region for selection announcements
- Focus indicators on interactive elements
- Respects `prefers-reduced-motion`
- High contrast colors meeting WCAG AA

## 8) Performance Targets
- 60 FPS rendering up to 10k commits
- Canvas-based instancing for efficiency
- LOD: aggregate old commits at far zoom
- Off-main-thread parsing via isomorphic-git

## 9) Repo Structure

```
 git-sonar/
 ├── src/
 │   ├── components/
 │   │   ├── GraphCanvas.tsx        # 2D visualization
 │   │   ├── ImportPanel.tsx        # Import UI
 │   │   ├── CommitSidebar.tsx      # Search + list
 │   │   ├── VirtualCommitList.tsx  # Virtualized list
 │   │   ├── CommitDetailsDialog.tsx
 │   │   ├── ControlsOverlay.tsx
 │   │   └── LiveRegion.tsx
 │   ├── lib/
 │   │   ├── git/
 │   │   │   ├── types.ts
 │   │   │   ├── graph.ts
 │   │   │   ├── import-local.ts
 │   │   │   └── import-git.ts      # GitHub/GitLab/Bitbucket import
 │   │   ├── themes/                # Theme definitions
 │   │   ├── utils/                 # Spatial index + batching
 │   │   └── store/
 │   │       └── graph-store.ts     # Zustand
 │   ├── styles/
 │   │   └── global.css
 │   └── pages/
 │       ├── index.astro            # Landing
 │       └── app.astro              # Main app
 ├── public/
 │   ├── _headers
 │   ├── robots.txt
 │   └── favicon.svg
 └── tests/
     └── e2e/
```

## 10) Roadmap (Current State)

**Complete**
- ✅ 2D Canvas visualization + spatial culling
- ✅ GitHub/GitLab/Bitbucket URL import + ZIP import
- ✅ Keyboard navigation + accessibility improvements
- ✅ Commit detail modal + virtualized list
- ✅ Search (fuzzy)
- ✅ Poster exports (SVG + PDF + print sizes)
- ✅ Themes (Rosé Pine, GitHub Dark, Nord, Dracula)
- ✅ Teaching mode (dev + art onboarding)

**Next Opportunities**
- Advanced filters (author/date range)
- Optional offline caching