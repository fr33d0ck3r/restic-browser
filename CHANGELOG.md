# Changelog

## [Unreleased]

### Fork changes (fr33d0ck3r/restic-browser)

- Build system rewired around a single Makefile: `make deps` installs NVM+Node, rustup+Rust, and system packages (apt/dnf/pacman); `make appimage` produces an AppImage in `bin/`.
- All comments stripped from `src/**/*.ts` and `src-tauri/src/**/*.rs` (per project convention).
- Dead code removed: `src/themes/`, `debian/`, `build.sh`, `.editorconfig`, `.claudeignore`, winget workflow.
- GitHub Actions workflow rewritten to produce Linux AppImage + Windows NSIS installer only (macOS job removed).
- LICENSE restored from upstream history.
- `.gitignore` now explicitly excludes `/src-tauri/target`, `/src-tauri/gen`, `/bin`.
- Screenshots captured via Xvfb against a local test repository (74 files / 11 directories / 2 snapshots).
- README cleaned up: dropped non-UI features (dump-as-zip and theme toggle) — both exist in code but are not wired to any UI component.
- 12 unused SVG icons removed from `src/assets/icons/`.
- Windows build fixed: `PermissionsExt` call in `webdav_bridge.rs` gated with `#[cfg(unix)]` (prevented compilation on `x86_64-pc-windows-msvc`).
- `tauri.conf.json` — removed `macOS` bundle section (no macOS builds produced).
- Stray remote branches (`main`, `fix/unix-perms-and-macos-artifact`) deleted; only `master` remains.
- CI: GitHub Release auto-created on `v*` tags with Linux AppImage + Windows NSIS artifacts (`generate_release_notes: true`).
- Windows installer warning fixed: `nsis` added to `tauri.conf.json` `bundle.targets` (was producing no `.exe` under `bundle/nsis/`).
