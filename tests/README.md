# Game verification scripts

Unit tests (`*.test.js`), Playwright browser checks (`browser-*.cjs`), and browser profiling scripts live here, separate from runtime code.

Run commands from the project root so source-file reads and generated `artifacts/` paths resolve correctly:

```sh
npm test
npm run test:browser
npm run test:editor:browser
npm run profile:browser
```

Individual scripts can also be run from the project root:

```sh
node --test tests/progression.test.js
node tests/browser-level-catalog.cjs
```

Browser checks use the existing server at `http://localhost:3000/`; they do not start one. If it is unavailable, skip browser verification. The static deployment check, `tests/browser-static-host.cjs`, defaults to the project root for its files and supports `STATIC_GAME_ROOT` for an unpacked release.

On Windows PowerShell, use `npm.cmd` if the execution policy prevents `npm.ps1` from running.
