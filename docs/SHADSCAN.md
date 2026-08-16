# Shadscan Workflow

Git Sonar uses Astro with React islands and a custom product-specific interface. It does not use a shadcn `components.json` registry. Shadscan can still inspect React-facing source, but its source score is advisory and should not drive a component-system migration.

The repository keeps Shadscan uninstalled and pins the command through `package.json`:

```bash
bun run audit:shadscan
```

The command emits a read-only JSON report. Review each finding against Git Sonar's real workflows: repository import, graph navigation, search, poster editing, permalink restoration, and PNG, SVG, and PDF export.

## Rendered overflow check

Run the production app or a local development server, then use Shadscan's separate rendered check:

```bash
bunx @shadscan/cli@0.17.0 \
  --check-ui https://gitsonar.jonathanrreed.com \
  --route /app \
  --route /about \
  --no-interactive \
  --no-roast
```

This checks document-level horizontal overflow at Shadscan's fixed 320 x 820 and 1440 x 1000 viewports. It does not verify canvas controls, keyboard navigation, repository imports, poster exports, dialog focus, share links, or restored poster state.

## Existing release checks remain authoritative

```bash
bun run lint
bun run typecheck
bun run test:run
bun run test:coverage
bun run build
bun run test:e2e
```

Do not add `--fail-under` until a complete report has been reviewed rule by rule. Do not add shadcn, duplicate components, generic cards, or new visual effects merely to improve a scanner score.

## Current status

The pinned command and review boundary are documented. Shadscan was not executed in the GitHub-only editing environment because the local shell could not resolve external hosts. No score or pass is claimed.
