# Speech recognition binaries

`scripts/build-whisper.sh` puts whisper.cpp's `whisper-server` here, one
directory per platform and architecture:

- `darwin-arm64/whisper-server`
- `darwin-x64/whisper-server`
- `win32-x64/whisper-server.exe`
- `linux-x64/whisper-server`

The binaries are not committed; the macOS installer workflow builds them
before packaging, and a developer runs the script once. Without one, the
composer's microphone says the build has no recogniser rather than
pretending. Two environment variables override the search for
development: `CAISRA_WHISPER_SERVER` (a binary) and `CAISRA_WHISPER_MODEL`
(a ggml model file).

The model (`ggml-base.bin`, 148 MB) is not here either. The app fetches it
on first use into its data directory under `speech/models`, checks its
SHA-1 against the value whisper.cpp publishes, and keeps it.
