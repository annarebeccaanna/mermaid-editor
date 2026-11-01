import { useState } from 'react';
import * as files from '../files';

/** Shown when somebody else saved the open cloud diagram after we loaded it. */
export function ConflictDialog() {
  const [busy, setBusy] = useState(false);
  const choose = async (c: 'overwrite' | 'reload' | 'copy') => {
    setBusy(true);
    await files.resolveConflict(c);
    setBusy(false);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal small" role="alertdialog" aria-labelledby="conflict-title">
        <header>
          <h2 id="conflict-title">Das Diagramm wurde geändert</h2>
        </header>
        <div className="modal-body">
          <p>Jemand anderes hat dieses Diagramm gespeichert, seit du es geöffnet hast. Was soll mit deinen Änderungen passieren?</p>
          <div className="conflict-options">
            <button className="text-btn" disabled={busy} onClick={() => choose('copy')}>
              <b>Als Kopie speichern</b>
              <span>Beide Stände bleiben erhalten. Du arbeitest mit der Kopie weiter.</span>
            </button>
            <button className="text-btn" disabled={busy} onClick={() => choose('reload')}>
              <b>Neu laden</b>
              <span>Die neue Version öffnen. Deine nicht gespeicherten Änderungen gehen verloren.</span>
            </button>
            <button className="text-btn danger" disabled={busy} onClick={() => choose('overwrite')}>
              <b>Meine Version behalten</b>
              <span>Überschreibt die Änderungen der anderen Person.</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
