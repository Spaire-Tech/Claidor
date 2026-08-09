# Icons

Placeholders. A flat rounded square in the Fluent communication blue the pane
already uses (`--brand-primary`, `#0f6cbd`) with a white C, generated rather
than drawn.

Upstream's icons were its own branding and were not copied into this fork.
These exist so a sideloaded manifest resolves every `IconUrl` and
`bt:Image` instead of showing Office's generic placeholder, and they are the
first thing a real design replaces.

Office reads `icon-16`, `icon-32` and `icon-80`; `icon-64` and `icon-128` are
here for the store listing and high-DPI ribbon.
