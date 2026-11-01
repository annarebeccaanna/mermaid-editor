import { useRef, useState } from 'react';

/** Inline text field: Enter confirms, Escape or an empty name cancels (onDone gets null). */
export function NameInput({ placeholder, initial = '', onDone }: { placeholder: string; initial?: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  // Enter and the blur that follows must not report twice
  const finished = useRef(false);
  const finish = (value: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      className="name-input"
      placeholder={placeholder}
      value={v}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v.trim() || null);
        if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v.trim() || null)}
    />
  );
}
