/**
 * Provas de comportamento da interface.
 *
 * A UI só era conferida por tipo e por build — as duas coisas passam
 * perfeitamente num botão que não faz nada. Foi assim que catorze controles
 * mortos chegaram até aqui, incluindo um formulário de configuração de projeto
 * que parecia salvar e não salvava.
 *
 * O que se prova aqui é o nosso lado da fronteira: clicar num controle produz a
 * requisição certa, e o que a resposta diz chega na tela. O `fetch` é o limite,
 * e cada prova declara o que ele devolve. Não substitui exercitar o produto num
 * navegador com Supabase Auth de verdade — isso continua não provado, e está
 * dito no ROADMAP.
 *
 * Reaproveita o `vite.config.ts`: mesmos alias, mesmo plugin de React. Uma
 * segunda configuração seria uma segunda verdade sobre como o módulo resolve.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    restoreMocks: true,
  },
}));
