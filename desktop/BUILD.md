# Build Caisra

macOS, Apple Silicon. Nothing here works on Linux or Intel.

> Do not paste a `#` comment on the same line as a command. zsh without
> `interactive_comments` runs it as an argument, which is how a `git pull`
> silently became `git pull '#' 'or' 'merge'` and nothing updated.

## Every time

```sh
cd ~/Claidor
git pull
cd desktop
nvm use
npm ci
npm run bootstrap
npm run package
npm run verify
open "dist/Caisra.app"
```

`nvm use` must print **26.5.0**. If it prints 24 you are in the wrong
directory — the monorepo root pins 24 for `clients/`.

`npm run bootstrap` is a no-op once `src/app/dist` exists, so it is safe to
leave in the sequence.

## First time on a machine

```sh
nvm install 26.5.0
```

Then the sequence above.

## After changing only server code

Nothing. The app is unchanged; `server/` deploys on its own.

## After changing `source/` or the packaging scripts

```sh
cd ~/Claidor/desktop
npm run package
npm run verify
open "dist/Caisra.app"
```

## Just to check the code without building

```sh
cd ~/Claidor/desktop
npm run check
```

## If you lose the DMG

```sh
cd ~/Claidor/desktop
npm run bootstrap
```

It walks every known source and checks each against the pinned digest. If they
have all gone it prints what it tried and why. See
`docs/product/getting-the-pinned-dmg.md`.

To keep that from ever mattering:

```sh
mkdir -p ~/Claidor/desktop/research-archives/original/0.18.0/macos-arm64
cp Grok_Bot_0.18.0.dmg ~/Claidor/desktop/research-archives/original/0.18.0/macos-arm64/
```

## What each step is

| command | what it does | how long |
| --- | --- | --- |
| `npm ci` | installs dependencies, refuses the wrong Node | ~10s |
| `npm run bootstrap` | extracts the pinned 0.18.0 payload to `src/app/dist` | ~20s |
| `npm run package` | compiles the runtimes, patches Settings, builds and signs `dist/Caisra.app` | a few min |
| `npm run verify` | audits the built bundle against its pins | ~5s |

`npm run package` runs `check` itself, so there is no need to run it first.

## Reading the components, not building the app

```sh
cd ~/Claidor/desktop
npm run build:clean-source
npm run start:clean-source
```

That builds `frontend/`, the design workspace. **It is not the product** and
never ships. See the header of `scripts/build-caisra.mjs`.
