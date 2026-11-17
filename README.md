# Git Sonar

![Git Sonar logo](public/favicon.svg)

Every repo deserves a retrospective. Git Sonar turns a commit history into a poster you can print and frame, and still lets you explore the history as a graph. Processing and rendering run in the browser; imported repository data is not uploaded to an app server.

The site is built as a gallery: posters hang framed on a wall with museum labels, the call to action is an empty frame, and a light switch in the navigation dims the room to its picture lights.

## Run locally

Use Node.js 24.22.1 (pinned in `.nvmrc`) and Bun 1.4.4 (pinned in
`package.json`). This project supports Node.js >=24.22.1 <25 to match the
pinned LTS runtime and its tooling dependencies. Both CI jobs read these same
version files.

```bash
git clone https://github.com/JonathanRReed/Git-sonar.git
cd Git-sonar
nvm use
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4321`.

## Import history

The app opens on one question, "Which repo are we hanging?", with four ways in:

- **Paste a link** to a GitHub, GitLab, or Bitbucket repository, or click one of the suggested public repos. An optional token supports private repositories and higher rate limits, and lets GitHub imports include lines added and removed (GitLab imports always include them).
- **Open a folder on this computer.** Pick the project folder; only `.git` is read, nothing is zipped, and it works offline.
- **Drop a `.git` zip** anywhere on the page: `cd your-repo && zip -r repo-git.zip .git`
- **Use the sample repo**, Project Atlas.

While a repository loads, its commits land in the empty frame and the wall label counts them.

## Explore the graph

Switch from Poster to History in the header. Drag to pan, scroll or pinch to zoom, and click a commit to select it. Double-click or press Enter for details. Search by message, author, or SHA. The timeline scrubber and calendar navigate by date; the camera and document controls export PNG and SVG.

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

The studio opens as soon as a repository loads. Pick a style from the rail (each thumbnail is drawn from your own history), then set the words, colours, and what the marks mean. The dice shuffle the composition and keep earlier rolls in a tray; the same roll and settings always reproduce the same design. Undo and redo work, as do `S` (shuffle), `W` (wall), and the arrow keys (styles).

| Style | Draws |
| --- | --- |
| Pulsar | Commit cadence as stacked ridgelines |
| Flow Field | Authors as seeded currents |
| Growth Rings | One ring per week, thick where the work was heavy |
| Transit Map | Branches as lines, commits as stations, merges as interchanges |
| Core Sample | One layer per month, coloured by who led it |
| Weave | A row per week, dyed by its lead author |
| Punch Card | Commits by weekday and hour, with the busiest slot named |
| Receipt | The history itemised by author, with a barcode from the head commit |
| Year in Code | A radial year-ring spiral |
| Album + Tracklist | Cover art and commits as tracks |
| Movie One-Sheet | Commit graph and a generated billing block |
| Constellation | Each month as its own constellation |
| Festival Lineup | Contributors arranged as a festival bill |
| Swiss Grid | A typographic data print |

Colour themes are Night, Dawn, Gallery Paper, Riso, Blueprint, GitHub, Nord, and Dracula, each with full, two-tone, one-ink, and vivid palettes (OKLCH).

**On a wall** hangs the poster in a gallery elevation drawn to scale: centred 57 inches above the floor, over a five-foot bench, with dimension lines and a choice of frame and mat. **Listen** plays the history as sound, one note per week.

Download asks what the poster is for: a screen (PNG), a print shop (PDF), a README (animated SVG plus the Markdown line), a designer (SVG), the clipboard, or a link. PDF supports A4 through A1, 18×24, and 24×36 print dimensions in sRGB, with an optional print-safe palette. Outputs embed fonts; SVG uses base64 `@font-face`, while PDF registers font faces. The build fetches TTF files into `public/fonts/`.

Copy link encodes settings in `#p=…`. Public-repository and demo links can reproduce the poster for another visitor. Private or local-import links restore settings only; the recipient still needs the repository data.

## Develop

```bash
bun run check
bun run lint
bun run lint:fix
bun run build
bun run preview
```

`bun run check` includes lint, guarded tool typechecking, unit tests, coverage,
a production build, and Playwright browser tests. Install browser dependencies
first with `bunx playwright install --with-deps`. TypeScript stays on version 6
because the current typescript-eslint release requires its API.

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
