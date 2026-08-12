/**
 * O último anteparo: exceção vira tela que diz o que houve.
 *
 * Sem isto, qualquer erro em qualquer componente desmonta a árvore inteira e o
 * React deixa a página em branco — sem mensagem, sem pista, sem nada. Aconteceu
 * em 27/07/2026, na primeira vez que a interface falou com o engine de verdade:
 * a tela certa piscava e sumia. Do lado de fora não havia como saber o que
 * quebrou, e quem estava usando não tinha por que abrir um console para
 * descobrir.
 *
 * Tela branca é o pior resultado possível: não distingue "quebrou" de "está
 * carregando" de "não carregou". Qualquer mensagem é melhor que nenhuma.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
  componente: string | null;
}

export class ErroVisivel extends Component<Props, State> {
  state: State = { erro: null, componente: null };

  static getDerivedStateFromError(erro: Error): Partial<State> {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    // A pilha de componentes é o que diz *onde*; a mensagem sozinha raramente
    // basta em código empacotado.
    this.setState({ componente: info.componentStack ?? null });
    console.error("[carbon] exceção não tratada", erro, info.componentStack);
  }

  render() {
    const { erro, componente } = this.state;
    if (!erro) return this.props.children;

    return (
      <main className="grid min-h-dvh place-items-center bg-[#f6f6f4] p-5 dark:bg-[#111]">
        <section className="w-full max-w-2xl rounded-[28px] border border-black/[0.08] bg-background p-7 shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
          <h1 className="text-[28px] font-semibold tracking-[-0.035em]">Algo quebrou nesta tela</h1>
          <p className="mt-2 text-[16px] leading-6 text-muted-foreground">
            O resto do sistema continua de pé. Isto aqui é a falha, escrita por inteiro — pode
            copiar e mandar.
          </p>

          <pre className="mt-6 max-h-64 overflow-auto rounded-2xl bg-black/[0.04] p-4 text-[13px] leading-5 dark:bg-white/[0.06]">
            {erro.name}: {erro.message}
            {erro.stack ? `\n\n${erro.stack}` : ""}
            {componente ? `\n\ncomponentes:${componente}` : ""}
          </pre>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-14 flex-1 rounded-2xl bg-foreground text-[16px] font-semibold text-background"
            >
              Recarregar
            </button>
            <button
              type="button"
              onClick={() => {
                const texto = `${erro.name}: ${erro.message}\n${erro.stack ?? ""}${componente ?? ""}`;
                void navigator.clipboard?.writeText(texto);
              }}
              className="min-h-14 flex-1 rounded-2xl border border-black/10 text-[16px] font-semibold dark:border-white/15"
            >
              Copiar erro
            </button>
          </div>
        </section>
      </main>
    );
  }
}
