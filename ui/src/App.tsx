import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Switch, Router as WouterRouter, useLocation, useParams } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";

import Home from "@/pages/Home";
import Pendentes from "@/pages/Pendentes";
import Caso from "@/pages/Caso";
import TodosProcessos from "@/pages/TodosProcessos";
import TiposProcesso from "@/pages/TiposProcesso";
import Regras from "@/pages/Regras";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 1000 * 60 * 5 } },
});

function Redirect({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, [navigate, to]);
  return null;
}

function LegacyCaseRedirect() {
  const { hash } = useParams<{ hash: string }>();
  return <Redirect to={`/processos/${hash}`} />;
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/pendencias" component={Pendentes} />
        <Route path="/processos/:hash" component={Caso} />
        <Route path="/processos" component={TodosProcessos} />
        <Route path="/tipos" component={TiposProcesso} />
        <Route path="/regras" component={Regras} />

        <Route path="/pendentes"><Redirect to="/pendencias" /></Route>
        <Route path="/agora"><Redirect to="/pendencias" /></Route>
        <Route path="/casos/:hash" component={LegacyCaseRedirect} />
        <Route path="/casos"><Redirect to="/processos" /></Route>
        <Route path="/permissoes"><Redirect to="/regras" /></Route>
        <Route path="/novo"><Redirect to="/" /></Route>
        <Route path="/sugestoes"><Redirect to="/" /></Route>
        <Route path="/resumos"><Redirect to="/" /></Route>
        <Route><div className="flex flex-1 items-center justify-center p-8 text-center"><div><h1 className="text-2xl font-bold">404</h1><p className="mt-2 text-muted-foreground">Página não encontrada.</p></div></div></Route>
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><Router /></WouterRouter>
    </QueryClientProvider>
  );
}
