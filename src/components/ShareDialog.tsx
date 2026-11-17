import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../cloud/auth';
import { addShare, listShares, removeShare, updateShareRole, type Share, type ShareRole } from '../cloud/shares';

const ROLE_LABEL: Record<ShareRole, string> = { viewer: 'Ansehen', editor: 'Bearbeiten' };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owner: who may see or edit this diagram. */
export function ShareDialog({ diagramId, name, onClose }: { diagramId: string; name: string; onClose: () => void }) {
  const myEmail = useAuth((s) => s.session?.user.email?.toLowerCase() ?? '');
  const [shares, setShares] = useState<Share[] | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setShares(await listShares(diagramId));
    } catch (e) {
      setError(errorText(e));
      setShares((s) => s ?? []);
    }
  }, [diagramId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Run a change, show a failure, and refresh the list. */
  const run = async (job: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await job();
    } catch (e) {
      setError(errorText(e));
    }
    await reload();
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    if (address.toLowerCase() === myEmail) return setError('Das ist deine eigene Adresse.');
    void run(async () => {
      await addShare(diagramId, address, role);
      setEmail('');
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" role="dialog" aria-label="Teilen" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>„{name}“ teilen</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <form className="share-form" onSubmit={submit}>
            <input type="email" autoFocus required placeholder="E-Mail-Adresse der Person" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select aria-label="Berechtigung" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              <option value="viewer">{ROLE_LABEL.viewer}</option>
              <option value="editor">{ROLE_LABEL.editor}</option>
            </select>
            <button className="primary-btn" type="submit" disabled={busy}>
              Teilen
            </button>
          </form>
          {error && <p className="login-error">{error}</p>}
          <p className="hint">
            <b>Ansehen:</b> die Person sieht das Diagramm und kann eine eigene Kopie speichern. <b>Bearbeiten:</b> sie ändert Inhalt und Namen. Verschieben, Löschen und Teilen bleiben bei dir.
          </p>
          <h3>Zugriff</h3>
          {shares === null && <p className="hint">Wird geladen …</p>}
          {shares && !shares.length && <p className="hint">Noch mit niemandem geteilt.</p>}
          <ul className="share-list">
            {shares?.map((s) => (
              <li key={s.id} className="share-row">
                <span title={s.email}>{s.email || 'Unbekannte Person'}</span>
                <select
                  aria-label={`Berechtigung für ${s.email}`}
                  value={s.role}
                  disabled={busy}
                  onChange={(e) => void run(() => updateShareRole(s.id, e.target.value as ShareRole))}
                >
                  <option value="viewer">{ROLE_LABEL.viewer}</option>
                  <option value="editor">{ROLE_LABEL.editor}</option>
                </select>
                <button className="icon-btn" title="Zugriff entziehen" disabled={busy} onClick={() => void run(() => removeShare(s.id))}>
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
