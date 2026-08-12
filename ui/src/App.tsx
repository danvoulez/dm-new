import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';

import Home from '@/pages/Home';
import Agora from '@/pages/Agora';
import Pendentes from '@/pages/Pendentes';
import Caso from '@/pages/Caso';
import Novo from '@/pages/Novo';
import Sugestoes from '@/pages/Sugestoes';
import Resumos from '@/pages/Resumos';
import Permissoes from '@/pages/Permissoes';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 1000 * 60 * 5 } },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/agora" component={Agora} />
        <Route path="/pendentes" component={Pendentes} />
        <Route path="/casos/:hash" component={Caso} />
        <Route path="/casos" component={Caso} />
        <Route path="/novo" component={Novo} />
        <Route path="/sugestoes" component={Sugestoes} />
        <Route path="/resumos" component={Resumos} />
        <Route path="/permissoes" component={Permissoes} />
        <Route><div className="flex-1 flex items-center justify-center p-8 text-center"><div><h1 className="text-2xl font-bold">404</h1><p className="mt-2 text-muted-foreground">Página não encontrada.</p></div></div></Route>
      </Switch>
    </AppLayout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>
    </QueryClientProvider>
  );
}
