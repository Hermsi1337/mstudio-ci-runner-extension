# UI style guide

Rules for everything a user sees inside mStudio. They apply to humans and agents
alike and come before personal taste. Writing style for texts is in
[AGENTS.md](../AGENTS.md#writing-style), the mechanics of the catalogs in
[i18n.md](i18n.md).

## Principles

1. **Flow first.** Every element comes from `@mittwald/flow-remote-react-components`.
   No own CSS, no inline styles, no HTML tags. If Flow has no component for a case,
   compose Flow components; if that fails, open an issue before building anything.
2. **One layout for every width.** The extension renders inside mStudio on phones,
   tablets and desktops. Components must work from 360 px up. Use Flow's responsive
   props (`s`, `m`, `l` on `ColumnLayout` and `ListItemView`), never fixed widths.
3. **No text floats.** Every text sits in a container that says what it is: a
   `LayoutCard` with a `Heading`, an `Alert`, an `AccentBox`, a `FieldDescription` or a
   `LabeledValue`. Plain `Text` directly on the page background is not allowed.
4. **The list is a list, not a table.** Collections of entities use Flow's `List`
   with `ListItemView`. Tables are reserved for data that is read column by column
   (numbers, comparisons) and even then only when they fit on a phone.
5. **Every state is designed.** Empty, loading, error and success have their own
   element: `IllustratedMessage` for empty and error, `SkeletonText` for loading,
   `Notification` for success and failure of an action.

## Page structure

```
Section
  AccentBox              brand header: logo, name, tagline, provider badges (BrandHeader.tsx)
  LayoutCard             one card per topic, Heading first
    Section
      Header             Heading + primary Button
      Alert status=info  explanation, when the card needs one
      Accordion          long optional background (limits, caveats)
      List | IllustratedMessage
  LayoutCard             feedback, links, secondary topics
```

- One primary button per card, in the `Header`, verb first ("Create runner").
- Secondary actions of an entity live in its `ContextMenu`, never as a row of
  buttons. Order: read (Logs), change (Settings), operate (Restart, Update), destroy
  (Delete) last.
- Destructive and interrupting actions confirm through `ConfirmModal`
  (`src/components/ConfirmModal.tsx`). The confirmation names the entity and what
  happens to running work.

## Modals

- Open modals through `useOverlayController("Modal", { reuseControllerFromContext:
  false })` and `<Modal controller>`. `ModalTrigger` is fine for a button that sits
  alone, never inside a `Section` `Header`: the header collects every `ActionGroup`
  below it, including the one inside the modal.
- Sizes: `s` for confirmations, `m` for settings, `l` for forms with a side column.
- A form modal is not dismissable by clicking outside (`isDismissable={false}`).
- Submit and cancel are an `ActionGroup` at the end of the `Form`; the primary
  button first.

## Forms

- `Form` from `@mittwald/flow-remote-react-components/react-hook-form`, fields via
  `typedField(form)`. Validation messages come from the catalogs.
- Group fields in `Section`s with a `Heading`. Do not repeat a section heading as a
  field label; if the first field carries the topic, the section has no heading.
- Every field has a `Label`. A `FieldHelp` next to the label explains the concept, a
  `FieldDescription` under the field explains the format or the consequence.
- Keep the form on the left and the consequences on the right (`ColumnLayout` with
  an `AccentBox`, see `CreatedResources.tsx`). The right column updates live from
  the form values.
- Values a user pasted are echoed back in an `Alert status="success"` with secrets
  masked (`ParsedCommand.tsx`).
- Presets come with an explicit "custom" option when the underlying value is a
  number the user may reasonably want to set.

## Lists

- `typedList<T>()` with `StaticData`, one `Item` rendering a `ListItemView`.
- Entities that belong to a parent are grouped by it: one `Section` per group with a
  `Header` (link to the parent, count badge) and one list per group. Search and a
  provider filter sit above the groups and apply to all of them.
- Row anatomy: `Avatar` (identity), `Heading` with badges (name, status), `Text` as
  subtitle (type, target), `LabeledValue` columns wrapped in `Content`, a
  `ContextMenu`. Column layout `s={[12]}`, `m={[6, 3, 3]}`, `l={[4, 2, 2, 2, 2]}`.
- Inside `ListItemView`, a bare `Text` is moved to the subtitle. Column values sit
  inside `Content`, which starts a new props context level.
- Search and filters appear from four entries on; below that they are noise.
- Status is a `Badge` with a fixed color per state (`StatusBadge.tsx`). Do not invent
  colors per component.

## Text and color

- `Text` has no `color` prop in this project. Flow's `color="light"` is white text
  for dark backgrounds and disappears on cards. Secondary information goes into a
  subtitle, a `LabeledValue` or a `FieldDescription`.
- Badges: `green` running, `blue` in progress, `orange` degraded, `red` error,
  `neutral` stopped, `violet` mode flags (ephemeral), `blue` update hints.
- Avatars: color encodes the provider (GitHub violet, GitLab teal). Do not encode
  status in the avatar, the badge does that.
- Icons come from Flow (`IconSettings`, `IconDelete`, ...). No emoji, no custom SVG.
  The only image is the logo in `BrandHeader.tsx`, inlined as a data URI because
  relative asset URLs point at the wrong host inside mStudio.

## Texts

- Catalog keys are dotted paths by screen and element: `runners.delete.heading`,
  `form.memory.help`. Every key exists in `en.ts` and `de.ts`.
- Headings are short noun phrases. Buttons are verbs. Confirmations are questions
  that name the entity ("Delete acme-app?").
- Help texts say what a value does and what a wrong value costs. No marketing.
- Click paths and UI labels of other products are inline code joined by arrows:
  `` `Settings` → `Actions` → `Runners` ``. Commands, flags and file names are inline
  code too. Texts with such markup are rendered through `Markdown` (`FieldHelp`,
  `ConfirmModal`); plain `Text` shows the backticks.
- German: "du", native phrasing, decimal comma.

## Checking a change

Take screenshots at 1440, 1024, 768 and 414 px in local mode
(`http://localhost:3000/local`, [development.md](development.md#local-mode-without-mstudio))
and once inside mStudio through `pnpm run dev:expose`. Remote rendering differs from
the DOM rendering in slot handling, so a change is finished only after both looked
right. Restart the dev server after editing components, the `local:` copies are not
watched.
