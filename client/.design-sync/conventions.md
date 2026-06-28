# PlannerPad Design System

PlannerPad is a real-time collaborative planner with a **pixel-art aesthetic**: hard offset shadows (`3px 3px 0 var(--primary)`), boxy 4px radii, Nunito font (700–900 weight), and a pink/purple palette anchored to `#F9A8D4`.

## Tokens

| Token | Value | Usage |
|---|---|---|
| `--primary` | `#F9A8D4` | Default shadow color, accents |
| `--primary-dk` | `#F472B6` | Hover state for interactive elements |
| `--border` | `#FBCFE8` | Borders, dividers |
| `--bg` | `#FFF8FC` | Page / panel background |
| `--surface` | `#FFFFFF` | Card / dropdown surface |
| `--surface-2` | `#FDF4FF` | Hover fill |
| `--text-1` | `#1A0A0E` | Primary text |
| `--text-2` | `#78527A` | Secondary / muted text |

## Core interaction patterns

- **Hard offset shadows**: interactive elements use `box-shadow: 3px 3px 0 var(--primary)` on rest; remove on `:active` to simulate a press.
- **Borders**: 2px solid, usually `var(--border)` at rest and `var(--primary-dk)` on hover/focus.
- **Font**: Nunito, weight 700 minimum for UI labels, 800+ for titles.
- **Radii**: 4px (`--r`) for cards/dropdowns, 2px (`--r-sm`) for small elements like format buttons.

## Components

- **Button** — primary CTA; uses `.btn` class; pink border + hard shadow; full-width flex center.
- **ConnectionBadge** — status pill with colored dot; statuses: `connected` (green), `connecting` (amber), `disconnected` (red).
- **UserBadge** — presence pill with user-assigned `color` for dot, border, and text; used inline in a `.users` row.
- **UserList** — wraps multiple `UserBadge` pills in a `.users` flex row.
- **Toast** — dark-background notification floating at viewport bottom-center; only shows when `message` is non-empty.
- **NameEditor** — inline editable display name with ✎ pencil icon; click to enter edit mode; saves on Enter or blur.
- **DeleteModal** — full-screen confirmation overlay requiring user to type "delete [roomName]" before the destructive button enables.
- **RoomMenu** — ··· trigger dropdown in the room pathbar; items: Copy Link, Export .ICS, Export .TXT, Rename Room, Leave Room (divider), Delete Room (danger style).
- **FormatToolbar** — single-row rich-text toolbar: B/I/U/S format buttons + Aa popover (Text Style picker, Lists section, Undo/Redo row).

## Notes

- DeleteModal preview renders an inline `.modal` box (no `.modal-overlay` wrapper) so it fits in a design card — in production it renders inside a `position: fixed` overlay.
- Toast preview overrides `position: fixed` to `relative` so it shows inside the card; in production it floats at viewport bottom.
- `FormatToolbar` uses `onMouseDown` + `e.preventDefault()` on all format buttons to preserve the editor's text selection during formatting.
