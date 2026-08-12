import { createRoot } from 'react-dom/client';
import App from './App';
import { ErroVisivel } from './components/ErroVisivel';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErroVisivel>
    <App />
  </ErroVisivel>,
);
