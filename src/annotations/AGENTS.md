# annotations

- **autolinks.ts** – Issue/PR autolink references. Consumed by `git/remotes/*` providers and
  `git/formatters/commitFormatter.ts` to linkify issue/PR references in commit messages.

The editor gutter/line annotation controllers (blame, heatmap, changes) were removed in the
Search & Compare-only refactor; only the autolink reference helper remains here.
