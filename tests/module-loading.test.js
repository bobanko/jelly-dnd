import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { instrumentModule } from './browser-harness.js';

async function loadInstrumented(context, entry, start) {
  const source = "import {start} from './fixture.js'; let counter=start;";
  const module = new vm.SourceTextModule(instrumentModule(source, entry), { context });
  await module.link(
    () =>
      new vm.SyntheticModule(
        ['start'],
        function () {
          this.setExport('start', start);
        },
        { context },
      ),
  );
  await module.evaluate();
}

test('browser inspection can read and change private ES module state without globalizing it', async () => {
  const context = vm.createContext({});
  await loadInstrumented(context, 'game.js', 3);
  const inspect = context.__moduleTestScopes.game;
  assert.equal(inspect('counter'), 3);
  inspect('counter+=2');
  assert.equal(inspect('counter'), 5);
  assert.equal(context.counter, undefined);
  assert.equal(context.start, undefined);
});

test('browser inspection keeps the game and editor module scopes independent', async () => {
  const context = vm.createContext({});
  await loadInstrumented(context, 'game.js', 1);
  await loadInstrumented(context, 'editor.js', 8);
  context.__moduleTestScopes.game('counter=4');
  assert.equal(context.__moduleTestScopes.game('counter'), 4);
  assert.equal(context.__moduleTestScopes.editor('counter'), 8);
});
