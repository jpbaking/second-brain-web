# Milestone 35: Layout & Theme UI Fixes

This milestone addresses glaring layout and theme compliance issues identified across several feature screens, ensuring all pages strictly adhere to the `lazyway` design kit.

## Checklist

### ProfileScreen.tsx Rewrite
- [x] Refactor the root container to use the `app-page` class instead of Tailwind-like utilities (`layout-stack-l`, `p-4`, etc.).
- [x] Rebuild the header using the standard `app-hero`, `app-title`, and `app-tagline` classes.
- [x] Update alert components to use the standard `.alert` classes (e.g. `alert-danger` / `alert-success`) instead of custom ones.
- [x] Refactor form fields to correctly use the kit's `field`, `label`, and `input` class structure.
- [x] Wrap the main content form in an `action-card`.

### SchedulesScreen.tsx Fixes
- [x] Update the `main` container to be wrapped in an `action-card` if appropriate, or ensure `stack-3` is correctly applied.
- [x] Refactor form elements to use `field`, `input`, and `select` classes instead of `form-group`, `text-input`, and `select-input`.
- [x] Replace non-existent CSS variables (`--surface-sunken`, `--text-muted`) with valid kit tokens (e.g., `--surface`, `--muted`).
- [x] Remove heavy inline styles (`style={{...}}`) and replace them with standard utility classes.

### MeetingPrepScreen.tsx Fixes
- [x] Replace incorrect form classes (`form-group`, `form-label`, `form-input`) with the standard kit classes (`field`, `label`, `input`/`textarea`).

### FollowUpsScreen.tsx Fixes
- [x] Replace the custom `followup-tabs` implementation with the kit's standard `.tab-list`, `.tab`, and `.tab.active` classes.
- [x] Replace references to the undefined `.btn-ghost` class with `.btn-quiet`.

### ExplorerScreen.tsx Fixes
- [x] Replace references to the undefined `.btn-ghost` class with `.btn-quiet`.

## Wrap-up
- [x] Verify the fixes visually by checking the local dev server.
- [x] Archive this checklist to `docs/progress/milestones/archive/` and update `BACKLOG.md` accordingly.
