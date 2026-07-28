# Changelog

## [Unreleased]

### Fork changes (fr33d0ck3r/restic-browser)

- Build system rewired around a single Makefile: `make deps` installs NVM+Node, rustup+Rust, and system packages (apt/dnf/pacman); `make appimage` produces an AppImage in `bin/`.
- All comments stripped from `src/**/*.ts` and `src-tauri/src/**/*.rs` (per project convention).
- Dead code removed: `src/themes/`, `debian/`, `build.sh`, `.editorconfig`, `.claudeignore`, winget workflow.
- GitHub Actions workflow rewritten to mirror the Makefile (Linux AppImage + Windows installer + macOS app).
- LICENSE restored from upstream history.
- `.gitignore` now explicitly excludes `/src-tauri/target`, `/src-tauri/gen`, `/bin`.
- Screenshots captured via Xvfb against a local test repository (74 files / 11 directories / 2 snapshots).
- README cleaned up: dropped non-UI features (dump-as-zip and theme toggle) — both exist in code but are not wired to any UI component.
