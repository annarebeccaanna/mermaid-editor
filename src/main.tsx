import { createRoot } from 'react-dom/client';
import '@xyflow/react/dist/style.css';
import './styles.css';
import App from './App';
import { useStore } from './store';
import { desktop } from './desktop';

// A window opened for a file gets it via ?file=…
const file = new URLSearchParams(location.search).get('file');
if (file && desktop) {
  desktop
    .readFile(file)
    .then((text) => useStore.getState().load(text, file))
    .catch((e) => useStore.getState().showToast(`Datei konnte nicht geöffnet werden: ${e.message}`));
}

createRoot(document.getElementById('root')!).render(<App />);
