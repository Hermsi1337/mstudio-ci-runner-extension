# Marketplace listing

The published entry:
[CI Runner in the mStudio Marketplace](https://studio.mittwald.de/marketplace/extensions/af91e32f-4596-4cbc-8d30-efc1c04b131f).

The texts of the marketplace entry live in `deploy/mstudio/extension.yaml`: name, tags,
support address, subtitle and both descriptions, in German and English. The deployment
writes them into mStudio, so nothing is maintained twice
([mstudio-setup.md](../mstudio-setup.md#marketplace-entry-and-frontend-fragment)).

Limits per language: subtitle 40 characters, brief description 300 characters, detailed
description unlimited. The API stores one brief description without a language and gets
the German one.

The screenshots in this directory are taken from the hosted extension inside mStudio;
`logo.png` is a copy of `src/assets/logo.png`.

## Assets

| File | Use |
|---|---|
| `logo.png` | Marketplace logo |
| `overview.png` | Runner list with a running GitHub runner |
| `create-choice.png` | Create flow, CI system choice |
| `create-form.png` | Create flow, GitHub form with resource summary |
