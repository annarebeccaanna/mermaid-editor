import { useEffect, useState } from 'react';
import { LogOut, X } from 'lucide-react';
import { cloudEnabled } from '../cloud/client';
import { useAuth } from '../cloud/auth';
import { linkErrorFromHash } from '../cloud/errors';
import { desktop } from '../desktop';
import { useStore } from '../store';

function LoginDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await useAuth.getState().sendLoginLink(email);
    setBusy(false);
    if ('error' in r) setError(r.error);
    else setSentTo(email.trim());
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Anmelden</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          {sentTo ? (
            <>
              <p>
                Wenn <b>{sentTo}</b> eingeladen ist, haben wir dir einen Anmelde-Link geschickt. Klicke ihn in der E-Mail an, dann bist du angemeldet.
              </p>
              <p className="hint">Nichts angekommen? Spam-Ordner prüfen oder in ein paar Minuten einen neuen Link anfordern.</p>
            </>
          ) : (
            <form className="login-form" onSubmit={submit}>
              <p className="hint">Du bekommst einen Link per E-Mail, ein Passwort brauchst du nicht. Anmelden können sich nur eingeladene Personen.</p>
              <input type="email" autoFocus required placeholder="E-Mail-Adresse" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {error && <p className="login-error">{error}</p>}
              <button className="primary-btn" type="submit" disabled={busy}>
                {busy ? 'Wird gesendet …' : 'Link senden'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sign-in button / account menu in the top bar. Web only for now. */
export function AccountMenu() {
  const session = useAuth((s) => s.session);
  const ready = useAuth((s) => s.ready);
  const [dialog, setDialog] = useState(false);
  const [menu, setMenu] = useState(false);

  // A login or invite link that is expired or already used comes back with an error in the URL.
  useEffect(() => {
    const msg = linkErrorFromHash(window.location.hash);
    if (!msg) return;
    useStore.getState().showToast(msg);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setDialog(true);
  }, []);

  // Close the dialog as soon as the login worked (also when the link is opened in another tab).
  useEffect(() => {
    if (session) setDialog(false);
  }, [session]);

  if (!cloudEnabled || desktop || !ready) return null;

  if (!session) {
    return (
      <>
        <button className="text-btn" onClick={() => setDialog(true)}>
          Anmelden
        </button>
        {dialog && <LoginDialog onClose={() => setDialog(false)} />}
      </>
    );
  }

  const email = session.user.email ?? '';
  return (
    <div className="dropdown-wrap">
      <button className="account-btn" title={email} onClick={() => setMenu(!menu)}>
        {email.charAt(0) || '?'}
      </button>
      {menu && (
        <div className="dropdown" onMouseLeave={() => setMenu(false)}>
          <div className="dropdown-label">Angemeldet als {email}</div>
          <button
            onClick={() => {
              setMenu(false);
              useAuth.getState().signOut();
            }}
          >
            <LogOut size={14} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}
