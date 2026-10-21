# Project Code Guidelines

## Tech Stack

- Vanilla JS with ES6+ modules, no frameworks.
- Plain CSS with custom properties.
- Serve runtime files directly without a required bundling step. Optional release packaging is allowed.
- Add services such as Firebase only when a feature requires them; they are not a refactoring prerequisite.

## JavaScript

### Naming

- Variables and functions: `camelCase`.
- Fixed configuration constants: `ALL_CAPS`. Ordinary `const` bindings, objects, and instances use `camelCase`.
- Single DOM element references: prefix with `$` (e.g., `$btnStart`, `$cardLeft`). This applies to every variable or parameter holding a DOM element, not just cached references.
- Collections of DOM elements (arrays, NodeLists): prefix with `$$` (e.g., `$$modeCards`, `$$gameCardRings`).
- CSS classes in JS: `kebab-case` strings.

### Module structure

- Use explicit ES module imports and exports for both browser code and Node.js scripts, including tests, server code, and release tooling.
- The development environment uses Node.js 26.7.0, which supports native ES modules and top-level `await`; no transpilation is needed for Node scripts.
- Make the module format explicit: use `.mjs` during the mixed CommonJS/ES module migration, or `.js` under a package with `"type": "module"`. Keep `.cjs` only for code that still requires CommonJS compatibility.
- Use `node:` imports for Node built-ins and explicit file extensions for relative ES module imports. Replace CommonJS-specific globals with module equivalents such as `import.meta.dirname` and `import.meta.url` when migrating scripts.
- Pure utility functions use free-standing named exports in focused modules; avoid a catch-all utility module.
- Stateful managers may use exported singleton objects or ES6 classes when multiple instances or instance lifecycle management are useful.
- Each module has a focused responsibility and is imported where needed.
- Migrate existing classic scripts and `Jelly*` globals in focused stages. Coordinate HTML entry points, loading, Node test compatibility, and browser tests; preserve behavior throughout the migration.
- Keep architectural migrations separate from bulk naming or formatting changes.

### DOM

- Query elements explicitly with `getElementById` or `querySelector`; do not rely on HTML IDs creating properties on `globalThis`.
- Cache frequently used elements once, after the relevant markup exists. Avoid repeated queries in hot paths and loops; refresh references when dynamic markup is replaced.
- Manipulate classes with `classList.add/remove/toggle/contains`.
- Use `dataset` for reading `data-*` attributes.

### Events

- Group screen-level event registration in `bindEvents()` when it improves clarity.
- Keep dynamic component listeners near their creation and cleanup; avoid duplicate listeners when components render again.
- Validate input early and return to avoid deep nesting.

### Comments and diagnostics

- Explain intent, constraints, and non-obvious behavior; avoid comments for self-evident code.
- When section headers help navigation, use `// ===== Section Name =====`.
- Preserve useful comments and diagnostics. Update or remove obsolete comments and temporary debugging logs as needed.
- Console messages should provide actionable context. Emoji prefixes are optional.

## CSS

### Variables

- Define shared design tokens in `:root` in a shared stylesheet loaded by both game and editor entry points.
- Keep component-specific custom properties local to their component.
- Use descriptive names such as `--color-*`, `--size-*`, and `--duration-*`.

### File organisation

- Keep game and editor entry styles separate where appropriate (`style.css`, `editor.css`), and reuse shared styles such as `controls.css`.
- Split logical UI areas into focused files when that improves maintenance.
- Stylesheets may be loaded with HTML links or CSS `@import`; neither mechanism is mandatory.

### Naming

- Component blocks: descriptive `kebab-case` names (`.card-container`, `.emoji-item`).
- State classes should be meaningful and scoped to the relevant component where needed (`.correct`, `.wrong`, `.hint`).
- Reuse existing utility/layout classes; introduce new ones only when they serve a repeated need.

### Nesting

- Use native CSS nesting where it improves readability, keeping selectors shallow and understandable.
- Do not rewrite working selectors solely to introduce nesting.

### Layout

- Use Flexbox for one-dimensional layout and Grid for two-dimensional layout.
- Use absolute positioning for overlays, decorative elements, and scene-related UI where appropriate.
- Prefer container alignment for ordinary layout centering; positioned overlays may use transforms when appropriate.
- Prefer `min()` / `max()` / `clamp()` for fluid sizing.

### z-index

- Rely on stacking contexts and DOM order first; add `z-index` only when necessary.
- Use a small, documented layer scale or named layer tokens. Avoid arbitrary escalating values; there is no fixed maximum of 3.

### Time values

- For CSS time values, use milliseconds (`ms`) below 1000ms and seconds (`s`) at 1000ms or above.

## HTML and UI

### IDs and screens

- Use stable, descriptive, unique HTML IDs. A `$` prefix is required for DOM reference variables, not HTML IDs.
- Preserve existing IDs unless a coordinated change is needed; update selectors and tests when changing them.
- Name screen reference variables consistently, e.g., `$screenStart` and `$screenGame`.

### i18n

- Localize application-owned visible text, generated messages, accessible labels, and tooltips.
- Use `data-i18n` for static markup where supported and translation functions for generated content.
- Keep translations in the existing `i18n.js` and `editor-i18n.js` systems until an explicit migration changes their storage and loading.
- Do not translate user-authored level names, descriptions, or editable map content automatically.

### Visibility

- Prefer `[hidden]` (`$element.hidden = true/false`) for ordinary visibility changes.
- Use a class when the hidden attribute does not fit the intended behavior, such as a transition or visually hidden accessible content.

### Labels and accessibility

- Associate controls with labels using either a wrapping `<label>` or an explicit `for`/`id` association, according to the layout.
- Decorative SVGs get `aria-hidden="true"`.
- Interactive elements use semantic tags (`<button>`, not `<div onclick>`).
- Keep keyboard access and visible focus states intact.

### Editor choices

- Prefer visible radio buttons or button groups for small fixed sets, especially colors, trigger groups, directions, and object properties.
- Reuse existing editor components, such as `colorRadios`. Give separate properties distinct radio-group names.
- Keep dropdowns for long or dynamic sets where visible buttons would overcrowd the interface.

### Icons and text

- Prefer existing icons when they convey the meaning clearly, such as a stopwatch for time or a skull for deaths.
- Reuse editor character icons and preserve their colors and visual style.
- Provide localized accessible labels. Keep visible text when an icon alone is insufficient.

### Keyboard hints

- Render each key in a `<kbd>` element using the existing key style, including rich tooltips and dynamic messages. Plain-text-only contexts should retain readable key names and actions.
- Include the action alongside the keys, such as Navigate, Select, Menu, or Move.
- Reuse the shared `controls.css` classes for hint panels, with the game footer's gold top border, spacing, and key styling.

## Refactoring and Verification

- Preserve gameplay, level formats, saved progress, editor drafts, and undo/redo behavior unless the task explicitly targets them.
- Work in focused, reviewable stages. Avoid mixing behavior changes with mechanical renaming or formatting.
- Run `npm run check` and `npm test` after code changes, plus relevant browser checks for affected interactions or layouts. Documentation-only changes do not require runtime tests.
- Use the already-running server for browser verification; do not start a local/dev server unless the user explicitly authorizes it.
- The current server and browser tests use `http://localhost:3000/`. Use that URL unless the user supplies another existing server URL; keep documentation and test configuration consistent when changing the default.
- If the expected server is unavailable, skip browser verification and report the omission. Do not launch a server or probe alternate ports as a workaround.

## Commit Messages

- After changes, suggest one ready-to-use commit message in the final response.
- Do not create a git commit unless the user explicitly asks for it.
- Write a short, specific, single-line English subject without a trailing period.
- Default to a type prefix: `feat:` for new player-facing functionality, `fix:` for bug fixes, `refac:` for internal rewrites, `style:` for visual-only changes, and `chore:` for maintenance, configuration, balance, documentation, or copy.
- Use an imperative verb after the prefix, e.g., `refac: extract shared camera controls`.
- Avoid generic subjects such as `Update files`, `Fix bugs`, or `Minor changes`.
