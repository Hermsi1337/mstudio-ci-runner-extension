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
  LayoutCard             brand header (BrandHeader.tsx)
    AccentBox            logo, name, tagline, provider badges, version badge and changelog button; backgroundColor "gradient" token, theme-aware, no custom hex
  LayoutCard             one card per topic, Heading first
    Section
      Header             Heading + primary Button
      Alert status=info  explanation, when the card needs one
      Accordion          long optional background (limits, caveats)
      List | IllustratedMessage
  LayoutCard             feedback, links, secondary topics
```

Every block on the page sits in a `LayoutCard`, the brand header included. A bare
`AccentBox` next to the cards carries a different corner radius and reads as if it
had slipped out of the layout.

- One primary button per card, in the `Header`, verb first ("Create runner").
- Secondary actions of an entity live in its `ContextMenu`, never as a row of
  buttons. Order: read (Logs), change (Settings), operate (Restart, Update), destroy
  (Delete) last, set apart by a `Separator`.
- Destructive and interrupting actions confirm through `ConfirmModal`
  (`src/components/ConfirmModal.tsx`). The confirmation names the entity and what
  happens to running work (update: the container is recreated, a running job fails
  and is not retried).
- A form whose submit interrupts running work (settings modal) shows an
  `Alert status="warning"` with the consequence as soon as the form is dirty. The
  alert sits between the fields and the `ActionGroup`.

## Modals

- Open modals through `useOverlayController("Modal", { reuseControllerFromContext:
  false })` and `<Modal controller>`. `ModalTrigger` is fine for a button that sits
  alone, never inside a `Section` `Header`: the header collects every `ActionGroup`
  below it, including the one inside the modal.
- Sizes: `s` for confirmations, `m` for settings, `l` for forms with a side column.
- Large, scrolling content (create form, settings, logs, changelog) opens as an
  off-canvas panel (`Modal offCanvas`, right side). Short confirmations stay
  centered modals.
- A form whose fields depend on an upfront choice opens with that choice alone:
  the create modal first shows only the CI system as a list of provider rows
  (Flow `typedList`, one `ListItemView` per provider with its logo from
  `provider-logos.ts`, marks from the `simple-icons` package on a white tile so
  they read on both themes), the form follows after the pick and offers a plain
  button back to the choice.
- A modal that is opened from two places says which one it serves. The changelog
  modal from the header lists the releases of the extension and marks the running
  one ("Current version"). From a runner's menu it opens with an `Alert status="info"`
  that names the runner's image version and the update target, lists only the
  releases between them and marks both ("Runs on this runner", "Update target").
  Nothing in the runner context is called "installed", because the runner and the
  extension run different versions.
- A settings modal with more than one topic splits them into `Tabs` (resources, job
  features, pipeline snippet). The tab list collapses into a menu on narrow widths.
  The warning `Alert` and the `ActionGroup` stay below the tabs, so they apply to
  every tab.
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
- Choices whose consequence matters are cards: `RadioGroup` with `RadioButton`s for
  one of a few presets (size), `CheckboxGroup` with `CheckboxButton`s for options
  saved with the form (job features). Each card has a `Text` as title and a `Content`
  with one sentence that names the effect or the limits. Flow reserves `Switch` for
  settings that apply at once, without a save button.
- Cards in one group sit side by side and their descriptions have about the same
  length in both languages. Flow's `ColumnLayout` does not stretch cards to one
  height, and a `CheckboxButton` that is wider than its text centers the text
  (Flow 1.1.48 lacks `grid-template-columns: auto 1fr` there, which `RadioButton`
  has, [mittwald/flow#3299](https://github.com/mittwald/flow/issues/3299)).
- Background that does not fit one sentence goes into the `FieldHelp` of the group
  label, at most a few short paragraphs, with a link into the documentation. No help
  button inside a card: the card is a label, and a button inside a label breaks the
  click target.
- The create form and the settings modal share their field components
  (`ResourceFields.tsx`, `JobFeatureFields.tsx`), so both show the same groups in the
  same order.

## Lists

- `typedList<T>()` with `StaticData`, one `Item` rendering a `ListItemView`.
- Entities that belong to a parent are grouped by it: one `Section` per group with a
  `Header` (link to the parent, count badge) and one list per group. Search and a
  provider filter sit above the groups and apply to all of them.
- Row anatomy: `Avatar` (identity), `Heading` with badges (name, status), `Text`s as
  subtitle in Flow's order "type – first fact – second fact" (provider, size,
  version), one `Content` with the values a user scans for, a `ContextMenu`. The
  `Content` holds its `LabeledValue`s in a wrapping `Flex`. Column layout
  `s={[1]}`, `m={[1, 1]}`, `l={[1, 1]}`.
- The header of a `ListItemView` is its first grid child and every `Content` adds one.
  More children than tracks wrap into the next row, where a value lands in the wide
  header track and looks indented. Keep header plus `Content`s equal to the number
  of tracks at every breakpoint.
- Details a user needs now and then sit in `Content slot="bottom"` with `accordion` on
  the `List`. A row in a failed state opens by default (`defaultExpanded`) and shows
  the message as an `Alert status="danger"` above the details.
- A filter with a handful of values is a `RadioGroup` of `Radio`s in a row.
  `SegmentedControl` is deprecated in Flow.
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
  `neutral` stopped, `violet` mode flags (ephemeral), `blue` update hints, `neutral`
  job features. A feature with a value is a scoped badge (`Label` plus `Text`, for
  example "Cache | 10 GB"). Only switched on features get a badge, "None" stands in
  for an empty set.
- `AccentBox` colors carry meaning or stay `neutral`. Three tiles side by side are
  all `neutral`; icon and heading tell them apart.
- Avatars: color encodes the provider (GitHub violet, GitLab teal). Do not encode
  status in the avatar, the badge does that.
- Icons come from Flow (`IconSettings`, `IconDelete`, ...), no emoji. The only custom
  SVGs are the logo in `BrandHeader.tsx` and the provider logos in `provider-logos.ts`,
  both inlined as data URIs because relative asset URLs point at the wrong host inside
  mStudio.

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

Take screenshots at 1440, 1024, 768 and 414 px inside mStudio through
`pnpm run dev:expose` ([development.md](development.md)).
