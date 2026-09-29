# Working on Simeon

1. Branch from `main`. Keep a branch to one change.
2. Run the checks for what you touched before you push:
   - server: `cd server && uv run task lint && uv run task lint_types && uv run task test`
   - web: `cd clients && pnpm lint && pnpm typecheck && pnpm test`
   - Mac app: `cd desktop && npm run check`
   - names: `python3 scripts/check_names.py` (see `docs/kept-names.md`)
3. Open a pull request with the template in `.github/pull_request_template.md`.

Patterns for the server are in `server/CLAUDE.md`, for the web app in
`clients/CLAUDE.md`. `DEVELOPMENT.md` explains how to run the server and web
app locally; `docs/building-the-app.md` explains the Mac app.

By contributing you agree that your contributions are licensed under the
licence of the part of the repository you change (see `README.md`).
