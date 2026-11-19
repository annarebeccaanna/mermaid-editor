import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { inviteByEmail } from '../cloud/invite';

/** Administrators: invite a new person by e-mail. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      await inviteByEmail(address);
      setSent((s) => [address, ...s]);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" role="dialog" aria-label="Person einladen" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Person einladen</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <p className="hint">Die Person bekommt eine E-Mail mit einem Link und hat danach ein Konto. Ohne Einladung kann sich niemand anmelden.</p>
          <form className="share-form" onSubmit={submit}>
            <input type="email" autoFocus required placeholder="E-Mail-Adresse" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primary-btn" type="submit" disabled={busy}>
              {busy ? 'Wird gesendet …' : 'Einladen'}
            </button>
          </form>
          {error && <p className="login-error">{error}</p>}
          {sent.length > 0 && (
            <>
              <h3>Eingeladen</h3>
              <ul className="share-list">
                {sent.map((a) => (
                  <li key={a} className="share-row">
                    <span title={a}>{a}</span>
                    <em className="sent-note">Einladung gesendet</em>
                  </li>
                ))}
              </ul>
              <p className="hint">Danach kannst du Diagramme und Ordner mit der Person teilen.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
