# Git Sonar

![Git Sonar logo](public/favicon.svg)

Explore Git history as a graph, then turn it into a poster, album cover, or generative print. Processing and rendering run in the browser; imported repository data is not uploaded to an app server.

## Run locally

```bash
git clone https://github.com/JonathanRReed/Git-sonar.git
cd Git-sonar
bun install
bun run dev
```

Open `http://localhost:4321`.

## Import history

Load a bundled Small, Medium, or Large demo. Alternatively, paste a GitHub, GitLab, or Bitbucket repository URL. An optional token supports private repositories and higher rate limits.

To import a local repository, zip its `.git` directory and drop the archive into the app:

```bash
cd your-repo && zip -r git-export.zip .git
```

## Explore the graph

Drag to pan, scroll or pinch to zoom, and click a commit to select it. Double-click or press Enter for details. Search by message, author, or SHA. The timeline scrubber and calendar navigate by date; the camera and document controls export PNG and SVG.

Branches occupy separate lanes. Spatial indexing, viewport culling, level-of-detail rendering, batched edges, debounced search, and incremental loading reduce work for large histories. Live announcements and focus management support screen readers.

| Key | Action |
| --- | --- |
| `↑` `↓` | Move between commits in the same lane |
| `←` `→` | Move to the previous or next commit |
| `Enter` | Open commit details |
| `Esc` | Close dialogs, clear selection, or leave an input |
| `/` | Focus search |
| `?` | Show help |
| `+` `=` | Zoom in |
| `-` `_` | Zoom out |
| `0` | Reset zoom to 100% |

## Make a poster

Import history, click Poster, then choose a template, title, theme, palette, and data mappings. Shuffle changes the seed; the same seed and settings reproduce the same design.

| Template | Uses |
| --- | --- |
| Movie One-Sheet | Commit graph and a generated billing block |
| Festival Lineup | Contributors arranged as a festival bill |
| Album + Tracklist | Cover art and commits as tracks |
| Flow Field | Seeded ribbons |
| Pulsar | Commit cadence as stacked curves |
| Year in Code | A radial year-ring spiral |
| Constellation | A star map |
| Swiss Grid | A typographic data print |

Map authors, lanes, time, or churn to color. Map churn, recency, or merges to size. Other controls adjust turbulence, density, and glow. OKLCH palettes use Night, Dawn, GitHub, Nord, or Dracula themes with duotone, mono, or vivid variants.

Export high-resolution PNG, vector SVG, or vector PDF. PDF supports A4 through A1, 18×24, and 24×36 print dimensions in sRGB, with an optional print-safe palette. Outputs embed fonts; SVG uses base64 `@font-face`, while PDF registers font faces. The build fetches TTF files into `public/fonts/`.

Copy link encodes settings in `#p=…`. Public-repository and demo links can reproduce the poster for another visitor. Private or local-import links restore settings only; the recipient still needs the repository data.

## Develop

```bash
bun run lint
bun run lint:fix
bun run build
bun run preview
```

The app uses Astro, React, Canvas 2D, Tailwind CSS, Zustand, fflate, and culori. resvg and sharp rasterize posters at build time. Theme credits include [Rosé Pine](https://rosepinetheme.com/).

| Path | Contents |
| --- | --- |
| `src/components/PosterStudio.tsx` | Poster editor |
| `src/components/GraphCanvas.tsx` | History graph |
| `src/components/ImportPanel.tsx` | Imports and demos |
| `src/components/` | Commit details, controls, timeline, announcements, and error states |
| `src/lib/git/`, `src/lib/store/` | Parsing and state |
| `src/lib/demo-data/`, `src/lib/utils/` | Sample histories and helpers |
| `src/pages/index.astro`, `src/pages/app.astro` | Landing page and app |
| `src/styles/`, `public/`, `tests/` | Styles, assets, and Vitest tests |

Contributions should follow the existing TypeScript conventions, document public APIs, and test new behavior. Run lint before opening a pull request.

## License

[MIT](LICENSE).
