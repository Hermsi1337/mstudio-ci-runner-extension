# Security policy

## Reporting a vulnerability

Do not open a public issue for security problems. Use one of these channels:

- GitHub private vulnerability reporting: *Security* tab of the repository, then
  *Report a vulnerability*.
- Email: hello@codeboarder.de

Include the affected version or commit, steps to reproduce and the impact you see.
You get a first reply within seven days. Fixes ship as a patch release with a note in
the release notes. Credit goes to the reporter unless you prefer otherwise.

## Scope

- The extension code in this repository and the images built from it
  (`ghcr.io/hermsi1337/mstudio-ci-runner-*`).
- Handling of stored credentials (GitHub PATs, GitLab and Forgejo runner tokens, mittwald access
  tokens). See the security section in
  [docs/architecture.md](../docs/architecture.md).

Problems in mittwald mStudio, Container Hosting, GitHub, GitLab or Forgejo themselves belong
to those vendors.

## Supported versions

Only the latest release receives fixes.
