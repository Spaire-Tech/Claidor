/* global window, document, requestAnimationFrame */
/**
 * Paste and run this script in the DevTools console.
 * Injects 200 mock messages into the current Cowork session for performance testing.
 *
 * Usage:
 *   1. Open a Cowork session
 *   2. Open DevTools (Cmd+Shift+I)
 *   3. Paste this script into the console and press Enter
 */

(function injectTestMessages() {
  // Try multiple methods to find Redux store
  let store = null;

  // Method 1: window.__REDUX_STORE__ (if exposed)
  if (window.__REDUX_STORE__) {
    store = window.__REDUX_STORE__;
  }

  // Method 2: Walk React fiber tree
  if (!store) {
    const rootEl = document.getElementById('root');
    if (rootEl) {
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (fiberKey) {
        let fiber = rootEl[fiberKey];
        while (fiber) {
          const s = fiber.memoizedProps?.store || fiber.stateNode?.store;
          if (s?.dispatch && s?.getState) {
            store = s;
            break;
          }
          fiber = fiber.return;
        }
      }
    }
  }

  // Method 3: Scan all DOM elements for React Provider
  if (!store) {
    const allEls = document.querySelectorAll('*');
    for (const el of allEls) {
      const key = Object.keys(el).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!key) continue;
      let fiber = el[key];
      let depth = 0;
      while (fiber && depth < 50) {
        const s = fiber.memoizedProps?.store;
        if (s?.dispatch && s?.getState) {
          store = s;
          break;
        }
        fiber = fiber.return;
        depth++;
      }
      if (store) break;
    }
  }

  if (!store) {
    console.error('Cannot find Redux store. Try running this in the renderer process DevTools.');
    console.log('Tip: In Electron, use View > Toggle Developer Tools, or press Cmd+Option+I while the main window is focused.');
    return;
  }

  const state = store.getState();
  console.log('Found Redux store. State keys:', Object.keys(state));
  const sessionId = state.cowork?.currentSessionId;
  if (!sessionId) {
    console.error('No active cowork session. Please open a session first.');
    return;
  }

  console.log(`Injecting 200 messages into session: ${sessionId}`);

  const sampleContents = [
    'Hi, could you help me analyze the performance of this piece of code?',
    'Sure. Let me take a look at your code...\n\n```typescript\nfunction fibonacci(n: number): number {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n```\n\nThis recursive implementation has O(2^n) time complexity. I recommend optimizing it with dynamic programming.',
    'Can you give me the optimized version?',
    'Of course, here is the version optimized with dynamic programming:\n\n```typescript\nfunction fibonacci(n: number): number {\n  if (n <= 1) return n;\n  let prev = 0, curr = 1;\n  for (let i = 2; i <= n; i++) {\n    [prev, curr] = [curr, prev + curr];\n  }\n  return curr;\n}\n```\n\nTime complexity drops from O(2^n) to O(n), with O(1) space.',
    'That looks good! Any other optimization ideas?',
    'You could also use **matrix exponentiation** to bring the time complexity down to O(log n):\n\n$$\\begin{pmatrix} F(n+1) \\\\ F(n) \\end{pmatrix} = \\begin{pmatrix} 1 & 1 \\\\ 1 & 0 \\end{pmatrix}^n \\begin{pmatrix} 1 \\\\ 0 \\end{pmatrix}$$\n\nFor most use cases, though, the O(n) version is more than enough.',
    'Write me a React component that shows a drag-and-drop sortable list.',
    'Happy to. This one uses the `@dnd-kit/core` library:\n\n```tsx\nimport { DndContext, closestCenter } from \'@dnd-kit/core\';\nimport { SortableContext, verticalListSortingStrategy } from \'@dnd-kit/sortable\';\n\nfunction SortableList({ items, onReorder }) {\n  return (\n    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>\n      <SortableContext items={items} strategy={verticalListSortingStrategy}>\n        {items.map(item => <SortableItem key={item.id} item={item} />)}\n      </SortableContext>\n    </DndContext>\n  );\n}\n```',
    'Thanks! Can you help me figure out why TypeScript is complaining?',
    'Please paste the error message.',
    '```\nTS2345: Argument of type \'string\' is not assignable to parameter of type \'number\'.\n```',
    'That is a type mismatch. You passed a string where the function expects a number. Convert it with `parseInt()` or `Number()`.',
    'Could you walk me through the directory structure of this project?',
    'Sure, let me look at the current project layout...\n\n```\nsrc/\n├── main/          # Electron main process\n├── renderer/      # React renderer process\n│   ├── components/\n│   ├── services/\n│   ├── store/\n│   └── types/\n└── shared/        # Shared types and utilities\n```',
    'Write a unit test for me.',
    '```typescript\nimport { describe, it, expect } from \'vitest\';\nimport { fibonacci } from \'./fibonacci\';\n\ndescribe(\'fibonacci\', () => {\n  it(\'should return 0 for n=0\', () => {\n    expect(fibonacci(0)).toBe(0);\n  });\n  it(\'should return 1 for n=1\', () => {\n    expect(fibonacci(1)).toBe(1);\n  });\n  it(\'should return 55 for n=10\', () => {\n    expect(fibonacci(10)).toBe(55);\n  });\n});\n```',
    'All tests passed ✅',
    'Great! The tests cover the edge cases and the normal path, so the code quality is in good shape.',
    'Anything else worth optimizing?',
    'I would add a few more tests:\n\n1. **Negative input** - check how `fibonacci(-1)` behaves\n2. **Large input** - check `fibonacci(50)` does not overflow\n3. **Performance** - make sure large inputs finish in a reasonable time',
    'Okay, I will add those test cases.',
  ];

  const now = Date.now();
  const messages = [];

  for (let i = 0; i < 200; i++) {
    const isUser = i % 2 === 0;
    const contentIndex = i % sampleContents.length;
    messages.push({
      sessionId,
      message: {
        id: `test-msg-${i}-${Date.now()}`,
        type: isUser ? 'user' : 'assistant',
        content: sampleContents[contentIndex],
        timestamp: now - (200 - i) * 1000,
        metadata: isUser ? {} : { isFinal: true },
      },
    });
  }

  // Batch dispatch
  const batchSize = 10;
  let injected = 0;

  function injectBatch() {
    const batch = messages.slice(injected, injected + batchSize);
    batch.forEach(msg => {
      store.dispatch({ type: 'cowork/addMessage', payload: msg });
    });
    injected += batch.length;
    console.log(`Injected ${injected}/${messages.length} messages...`);

    if (injected < messages.length) {
      requestAnimationFrame(injectBatch);
    } else {
      console.log('✅ Done! 200 messages injected. Scroll the chat to test performance.');
    }
  }

  injectBatch();
})();