import { useEffect } from 'react';
import { X } from 'lucide-react';
import { POLICY, POLICY_TITLE, policyText } from '../legal/datenschutz';
import { findPlaceholders, splitPlaceholders } from '../legal/placeholders';

/** Text with open details ([[SO]]) shown highlighted. */
function Text({ children }: { children: string }) {
  return (
    <>
      {splitPlaceholders(children).map((p, i) =>
        p.open ? (
          <mark key={i} className="open-detail" title="Diese Angabe fehlt noch">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function PrivacyDialog({ onClose }: { onClose: () => void }) {
  const open = findPlaceholders(policyText());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-label={POLICY_TITLE} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{POLICY_TITLE}</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body policy">
          {open.length > 0 && (
            <p className="policy-draft">
              <b>Entwurf:</b> Es fehlen noch {open.length} {open.length === 1 ? 'Angabe' : 'Angaben'} (gelb markiert). Der Text ist noch nicht rechtlich geprüft.
            </p>
          )}
          {POLICY.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              {s.paragraphs?.map((p, i) => (
                <p key={i}>
                  <Text>{p}</Text>
                </p>
              ))}
              {s.list && (
                <ul>
                  {s.list.map((l, i) => (
                    <li key={i}>
                      <Text>{l}</Text>
                    </li>
                  ))}
                </ul>
              )}
              {s.after?.map((p, i) => (
                <p key={i}>
                  <Text>{p}</Text>
                </p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
