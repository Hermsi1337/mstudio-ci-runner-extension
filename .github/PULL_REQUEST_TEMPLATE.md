## What changes

<!-- One or two sentences. Link the issue if one exists: Closes #123 -->

## Checks

- [ ] `pnpm run codegen` leaves `src/generated` unchanged
- [ ] `pnpm run check && pnpm run typecheck && pnpm run build` pass
- [ ] `pnpm run test` passes (`pnpm run test:integration` if domain code changed)
- [ ] Docs updated for changed behavior, config, env vars, scripts or structure
- [ ] User-facing text added to both catalogs in `src/i18n/`
- [ ] Title follows Conventional Commits
