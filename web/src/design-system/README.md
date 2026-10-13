# Design system

The building blocks every screen is made from. Look here first before writing a new component or CSS class.

## What's here

- `design-system.css`: colour and type tokens, the base reset and utilities, and the CSS for every primitive below.
- `Adder.tsx`: an "Add …" text button that opens an inline form in its place. Pass `open` and `onOpenChange` to control it, and `onSubmit` to make the opened box a form.
- `Amount.tsx`: a short money figure that shows the full amount in a `Tip`.
- `Badge.tsx`: `Badge`, a small text pill with an optional icon and tone (`ok`, `bad`, `new`, `on`, `warn`), a button when given `onClick` and a link when given `href`; and `IconBadge`, a toned icon chip in five sizes, square or round, or on a colour of its own.
- `CardHead.tsx`: a card's heading, with optional help below it and actions on the right.
- `Chart.tsx`: an ECharts canvas that follows the theme's series colours.
- `Chat.tsx`: the chat surface, its bubbles, the thinking bubble, `ChatError`, the empty-state starters and `FollowUps`, assist chips of questions to ask next. `Theirs` with `typing` types its `text` out through `Typed` and holds back the rest of the reply until it is done.
- `Chips.tsx`: `ToggleChips`, filter chips used as a radio or a toggle set, in one equal-width row, or with `grid` an equal-width grid that wraps; and `RemovableChips`, input chips that each remove a value, with `stack` putting each on a full-width row.
- `ColourPicker.tsx`: colour swatches, the preset seeds plus a custom colour, or a fixed set passed as `colours`.
- `Confirm.tsx`: `useConfirm`, a promise-returning confirm dialog.
- `DayPicker.tsx`: seven equal round toggles, one per weekday, each carrying the full day name for screen readers.
- `Dialog.tsx`: the standard dialog, with an optional step indicator and footer.
- `DialogActions.tsx`: a dialog's footer row: a note or a remove button on the left, then Back, Cancel, any extras and the main button.
- `DropZone.tsx`: a dashed area that takes a dropped or chosen file, with a spinner while busy.
- `Empty.tsx`: an empty state with an icon, a title, an optional line and an optional action; `inline` makes it a single quiet row for inside a card.
- `Facts.tsx`: an info button that opens a popover (a sheet on phones) of label and value pairs.
- `Fields.tsx`: `TextField`, `Select`, `SwitchRow`, `Label` and `Info`.
- `Fold.tsx`: a collapsible card that opens and scrolls into view when the URL hash names it, or a link to another page when given `to`.
- `FormActions.tsx`: a form's submit and cancel buttons.
- `Group.tsx`: a labelled group of controls.
- `Hero.tsx`: the large tinted card at the top of a section: icon, title, meta, a big figure with a pill or a pair of figures, stats and a foot line.
- `IconPicker.tsx`: a grid of icons to pick one from.
- `Item.tsx`: a row with a toned icon, a title, detail and actions; a button with an optional chevron when given `onClick`.
- `ListRow.tsx`: a two-line row with an avatar, and a value or actions on the right.
- `Middle.tsx`: text cut in the middle so both ends stay readable.
- `motion.ts`: `still()`, true when the system asks for reduced motion; `useCount`, a figure that counts up from 0; and `useReveal`, mounted once in the app shell, which fades cards in as they scroll into view. The `.enter` class fades and rises content as it mounts, and `.grow` grows its children's widths from 0.
- `More.tsx`: a "show more" toggle around extra content.
- `PageHead.tsx`: a screen's title, status line and actions.
- `Progress.tsx`: the wavy progress bar.
- `SecretField.tsx`: a write-only secret field that shows whether one is saved.
- `Segmented.tsx`: a segmented control, optionally showing sort direction; an option may carry an accessible name, and `counts` puts a number beside each label.
- `Snack.tsx`: `SnackProvider` and `useSnack` for transient messages.
- `Spinner.tsx`: the loading spinner, and `Wait`, a centred spinner with an optional line.
- `Stat.tsx`: `Stat`, a label, a value and an optional sub line, and `Stats`, a grid of them in one of four looks: `tile`, `mini`, `box` or `plain`.
- `Tabs.tsx`: primary tabs that fade at an edge and show a chevron there when more tabs are scrolled out of view.
- `Tile.tsx`: a large pickable tile with an icon, a title and a hint, or an outlined "add" tile.
- `Tip.tsx`: a tooltip on hover and focus.

## Rules

- **Look here first:** Before writing a new component or CSS class, check whether one here already does the job.
- **Nothing here imports feature code:** No imports from `components/`, `screens/` or feature parts of `lib/`. Pure helpers such as `lib/format` and `lib/hooks` are fine. Pass data in as props and declare the small types a primitive needs locally.
- **Promote on the third use:** When the same pattern shows up a third time in feature code, move it here.
- **Keep it plain:** One flat folder, one file per primitive, no index barrel, no Storybook, no theming framework.

## How the CSS is organised

- `design-system.css` holds the tokens and the primitives. `main.tsx` imports it before `styles.css`.
- `styles.css` holds the app shell (rail, nav, bar, onboarding and sign-in frames) and the CSS for each feature.
- Because the design system loads first, a feature rule of equal specificity overrides a primitive. Override in `styles.css`; never edit a primitive for one screen.
