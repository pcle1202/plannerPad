# design-sync run notes

## DeleteModal preview — in-cell errors

The `DeleteModal` preview consistently triggers 2 caught in-cell errors during the Playwright render check (one per export story). The modal renders visibly and correctly in both cards (confirmed via contact sheet screenshot). The errors are React caught-in-cell warnings, likely from the `<input>` element in headless Chromium. Visual quality is fine; this is a false-alarm from the renderer, not a component bug. `bad: 1` on last validate run.

If this becomes a problem in Claude Design, rework the preview to use a `<div>` styled to look like the input field instead of a real `<input>`.

## Nunito font — runtime prefix

Nunito is loaded via Google Fonts URL in `index.html`, not via `@font-face`. Added `"runtimeFontPrefixes": ["Nunito"]` to config to suppress `[FONT_MISSING]` warning.

## componentSrcMap + dtsPropsFor

No TypeScript or `.d.ts` files in this project. Components are discovered via `componentSrcMap` pointing at each `.jsx` source file. Props types are hand-written in `dtsPropsFor`. Keep both in sync when adding new components.
