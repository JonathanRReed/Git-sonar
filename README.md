# Git Sonar

![Git Sonar logo](public/favicon.svg)

Git Sonar turns a Git repo's commit history into a poster you can print and frame. I built it as a love letter to code. When you spend months on a project you're proud of, it usually just sits in a repo where nobody sees it, so this gives you something real to hang up. It's free and runs completely in your browser, so your code never gets uploaded to a server.

The site is styled like a gallery wall. Posters hang in frames with small labels, the hero lets you paste your own repo right into an empty frame, and the light switch in the nav dims the room.

## Run locally

Use Node.js 24.22.1 (pinned in `.nvmrc`) and Bun 1.4.4 (pinned in `package.json`). This project supports Node.js >=24.22.1 <25 to match the pinned LTS runtime and its tooling dependencies. Both CI jobs read these same version files.

```bash
git clone https://github.com/JonathanRReed/Git-sonar.git
cd Git-sonar
nvm use
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:4321`.

## Import history

The studio opens with four ways to load a repo:

- **Paste a link** to a GitHub, GitLab, or Bitbucket repository, or pick one of the suggested public repos. You can add an optional access token to load private repos and raise rate limits. On GitHub, a token also unlocks line addition and deletion counts (GitLab includes those automatically).
- **Open a local folder** on your computer. Pick the project folder and Git Sonar reads only `.git`. No zipping needed, and it works offline.
- **Drop a `.git` zip** anywhere on the page: `cd your-repo && zip -r repo-git.zip .git`
- **Use the sample repo**, Project Atlas.

You can also set a cutoff date if you want a poster from launch day or an older release. While commits load, they fill the empty frame and the label counts them live.

## Explore the graph

Switch from Poster to History in the header to inspect the commit graph. Drag to pan, scroll or pinch to zoom, and click a commit to select it. Double-click or press Enter to open details, or search by message, author, or SHA. The timeline scrubber and calendar let you jump by date, and the export drawer saves PNG, SVG, or printable PDF views of the graph.

Each branch gets its own lane. To keep large repos fast, the canvas uses spatial indexing, viewport culling, batched edges, and incremental loading, along with debounced search and screen-reader announcements.

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

The studio opens as soon as your repo loads. Pick a style from the left rail, where every thumbnail is rendered from your own repo, then change the title, tagline, colors, and what the shapes show. The dice button shuffles the layout and keeps earlier rolls in the bottom tray so you can click back through them. Using the same roll and settings always reproduces the exact same poster. Undo and redo work, along with `S` to shuffle, `W` to toggle the wall preview, and the arrow keys to step through styles.

| Style | Draws |
| --- | --- |
| Pulsar | Commit activity stacked as ridgelines |
| Flow field | Curved commit lines colored by author and weighted by lines changed |
| Growth rings | One ring per week, thicker when more commits landed |
| Transit map | Branches as lines, commits as stations, and merges as interchanges |
| Core sample | One layer per month, colored by whoever committed the most |
| Weave | One woven row per week, colored by the top author |
| Punch card | Commits by weekday and hour, with the busiest slot called out |
| Receipt | Itemized contributor breakdown with a barcode from the latest commit |
| Year in code | One ring per year spiraling out around the title |
| Album | Album cover with a radial commit graph and numbered tracklist |
| Movie poster | Commit graph with a big title and generated credits block |
| Constellation | Commits plotted as stars grouped by month |
| Festival | Contributors arranged like a festival lineup |
| Swiss grid | Clean grid poster with the repo stats up front |

Color themes include Git Sonar Night, Rosé Pine Dawn, Gallery Paper, Riso, Blueprint, Acid Test, Blacklight, Thermal, Phosphor, Sherbet, Gold Leaf, GitHub Dark, Nord, and Dracula. Each supports full, two-tone, one-ink, and vivid OKLCH palettes.

**On a wall** previews the poster to scale, centered 57 inches above the floor over a 5 ft bench, with dimension lines plus frame and mat controls. **Listen** plays your commit history as sound, one note per week.

The Download menu lets you pick by use case: PNG for screens, PDF for a print shop, animated SVG with a Markdown snippet for a README, editable SVG, clipboard copy, or a shareable link. PDF exports support A4 through A1, 18×24, and 24×36 print sizes in sRGB with an optional print-safe palette. Fonts are embedded automatically. SVG uses base64 `@font-face` and PDF registers the font faces directly from TTF files fetched into `public/fonts/` during build.

Copy link packs your settings into `#p=…`. Public repo and sample links reopen the exact same poster for anyone. Private or local repo links only restore the settings, so the other person still needs the repo data locally.

## Develop

```bash
bun run check
bun run lint
bun run lint:fix
bun run build
bun run preview
```

`bun run check` runs lint, guarded tool typechecking, unit tests, coverage, a production build, and Playwright browser tests. Install the Playwright browsers first with `bunx playwright install --with-deps`. TypeScript stays on version 6 because the current `typescript-eslint` release depends on its API.

Built with Astro, React, Canvas 2D, Tailwind CSS, Zustand, fflate, and culori. Build-time poster thumbnails use resvg and sharp. Theme credits include [Rosé Pine](https://rosepinetheme.com/).

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

Contributions should match the existing TypeScript style, document public APIs, and add tests for new behavior. Run lint before opening a pull request.

## License

[MIT](LICENSE).
