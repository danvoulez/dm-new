import '@testing-library/jest-dom/vitest';
import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(cleanup);

/**
 * Nenhuma prova pode tocar a rede de verdade.
 *
 * Um `fetch` que escapa não falha: ele pende, ou pior, sai para a internet a
 * partir do CI. Substituir o global por algo que grita é o que garante que toda
 * chamada seja declarada pela prova que a espera.
 */
globalThis.fetch = (async (input: RequestInfo | URL) => {
  throw new Error(
    `fetch não declarado nesta prova: ${typeof input === 'string' ? input : String(input)}\n` +
    'Use o helper `responderApi` de src/test/api.tsx.',
  );
}) as typeof fetch;

// jsdom não implementa nenhum dos dois, e componentes de lista os usam.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// jsdom não implementa rolagem. São lacunas do ambiente, não do produto: sem
// elas o React derruba a árvore num `useEffect` que só rola a lista.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

expect.extend({});
