import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../cloud/auth';
import { addShare, foldersAbove, listInheritedShares, listShares, removeShare, updateShareRole, type InheritedShare, type Share, type ShareRole, type ShareTarget } from '../cloud/shares';

const ROLE_LABEL: Record<ShareRole, string> = { viewer: 'Ansehen', editor: 'Bearbeiten' };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owner: who may see or edit this diagram or folder. Also shows who gets there through a folder above. */
export function ShareDialog({ target, name, onClose }: { target: ShareTarget; name: string; onClose: () => void }) {
  const myEmail = useAuth((s) => s.session?.user.email?.toLowerCase() ?? '');
  const [shares, setShares] = useState<Share[] | null>(null);
  const [inherited, setInherited] = useState<InheritedShare[]>([]);
  const [above, setAbove] = useState<Array<{ id: string; name: string }>>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, id } = target;
  const isFolder = kind === 'folder';

  const reload = useCallback(async () => {
    try {
      const folders = await foldersAbove({ kind, id });
      const [own, via] = await Promise.all([listShares({ kind, id }), listInheritedShares(folders.map((f) => f.id))]);
      setAbove(folders);
      setShares(own);
      setInherited(via);
    } catch (e) {
      setError(errorText(e));
      setShares((s) => s ?? []);
    }
  }, [kind, id]);

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
      await addShare(target, address, role);
      setEmail('');
    });
  };

  const folderName = (id: string) => above.find((a) => a.id === id)?.name ?? 'Ordner';

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" role="dialog" aria-label="Teilen" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{isFolder ? `Ordner „${name}“ teilen` : `„${name}“ teilen`}</h2>
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
          {isFolder ? (
            <p className="hint">
              Die Freigabe gilt für alles in diesem Ordner, auch für Unterordner und später angelegte Diagramme. <b>Ansehen:</b> die Person liest nur. <b>Bearbeiten:</b> sie ändert Diagramme und legt neue im Ordner an. Ordner anlegen, Verschieben, Löschen und Teilen bleiben bei dir.
            </p>
          ) : (
            <p className="hint">
              <b>Ansehen:</b> die Person sieht das Diagramm und kann eine eigene Kopie speichern. <b>Bearbeiten:</b> sie ändert Inhalt und Namen. Verschieben, Löschen und Teilen bleiben bei dir.
            </p>
          )}
          <h3>Zugriff</h3>
          {shares === null && <p className="hint">Wird geladen …</p>}
          {shares && !shares.length && !inherited.length && <p className="hint">Noch mit niemandem geteilt.</p>}
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
            {inherited.map((s) => (
              <li key={s.id} className="share-row inherited">
                <span title={s.email}>{s.email || 'Unbekannte Person'}</span>
                <em>
                  {ROLE_LABEL[s.role]} · über Ordner „{folderName(s.folder_id)}“
                </em>
              </li>
            ))}
          </ul>
          {inherited.length > 0 && <p className="hint">Zugriff über einen Ordner änderst du am Ordner selbst.</p>}
        </div>
      </div>
    </div>
  );
}
