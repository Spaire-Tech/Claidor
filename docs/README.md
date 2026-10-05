# Simeon documentation

| File | What it covers |
|---|---|
| [architecture.md](architecture.md) | How the Mac app, the agent's computer, the API server, the worker, the runner, the web app and the website fit together. Logs and switches. |
| [building-the-app.md](building-the-app.md) | Building, installing and checking the Mac app. Publishing the host bundle. |
| [services-core.md](services-core.md) | What the server does for the app, part 1: sign-in, the model proxy and spend guards, memory sync, the cloud computer. |
| [services-agents.md](services-agents.md) | Part 2: cloud agents, routines and event listeners, sharing, Discord and Slack, video, skill publish, connectors, and agent features that touch the server. |
| [services-billing.md](services-billing.md) | Part 3: the plans (Standard, Pro, Max), the trial, the billing engine, how the app's weekly allowance follows the plan, and the settings Render needs. |
| [cost-test-set.md](cost-test-set.md) | Thirty real tasks to run before and after a change that could move cost or quality, and how to read the cost per reason. |
| [ops/box-host/](ops/box-host/) | Setting up a server for cloud computers, and the settings Render needs. |
| [kept-names.md](kept-names.md) | Which earlier names are still in the code, why, and how the name check works. |

Patterns for writing server code are in `server/CLAUDE.md`, for the web app in
`clients/CLAUDE.md`. Running the server and web app locally is in
`DEVELOPMENT.md` at the repository root.

Believe the code over a document: if they disagree, fix the document.
