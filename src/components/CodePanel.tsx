import { useEffect, useRef, useState } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { Decoration, type DecorationSet, keymap } from '@codemirror/view';
import { Annotation, EditorState, StateEffect, StateField } from '@codemirror/state';
import { mermaid as mermaidLang } from 'codemirror-lang-mermaid';
import { Check, Code2, Copy, Eye, X } from 'lucide-react';
import { useStore } from '../store';
import { copyCode } from '../files';
import { renderCode, renderSvg } from '../mermaid/render';

const fromStore = Annotation.define<boolean>();

// Highlight the lines that mention the selected elements
const setHighlight = StateEffect.define<string[]>();
const lineMark = Decoration.line({ class: 'cm-selected-element' });
const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (!e.is(setHighlight)) continue;
      const ids = e.value;
      if (!ids.length) return Decoration.none;
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])(${ids.map((i) => i.replace(/[-]/g, '\\-')).join('|')})(?![\\p{L}\\p{N}_])`, 'u');
      const marks = [];
      for (let i = 1; i <= tr.state.doc.lines; i++) {
        const line = tr.state.doc.line(i);
        if (/^\s*(classDef|%%)/.test(line.text)) continue;
        if (re.test(line.text)) marks.push(lineMark.range(line.from));
      }
      return Decoration.set(marks);
    }
    return deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

function Editor() {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: useStore.getState().code,
        extensions: [
          basicSetup,
          mermaidLang(),
          highlightField,
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-Enter',
              run: () => {
                useStore.getState().applyCode();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || u.transactions.every((t) => t.annotation(fromStore))) return;
            const s = useStore.getState();
            s.setCode(u.state.doc.toString());
            clearTimeout(timer.current);
            if (s.autoUpdate) timer.current = setTimeout(() => useStore.getState().applyCode(), 400);
          }),
        ],
      }),
    });
    view.current = v;

    // Push canvas-driven code changes into the editor
    const unsub = useStore.subscribe((s, prev) => {
      if (s.code !== prev.code && s.code !== v.state.doc.toString()) {
        v.dispatch({
          changes: { from: 0, to: v.state.doc.length, insert: s.code },
          annotations: fromStore.of(true),
        });
      }
      if (s.selection !== prev.selection || s.code !== prev.code) {
        const ids = s.selection.flatMap((id) => {
          const e = s.diagram.edges.find((x) => x.id === id);
          return e ? [] : [id];
        });
        v.dispatch({ effects: setHighlight.of(ids) });
      }
    });
    return () => {
      unsub();
      clearTimeout(timer.current);
      v.destroy();
    };
  }, []);

  return <div className="editor" ref={host} />;
}

function Preview() {
  const diagram = useStore((s) => s.diagram);
  const filePath = useStore((s) => s.filePath);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const out = await renderSvg(renderCode(diagram, filePath));
        if (!cancelled) {
          setSvg(out);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [diagram, filePath]);
  return (
    <div className="preview">
      {error && <div className="code-errors">Mermaid: {error}</div>}
      <div className="preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

export function CodePanel({ onClose }: { onClose: () => void }) {
  const autoUpdate = useStore((s) => s.autoUpdate);
  const codeDirty = useStore((s) => s.codeDirty);
  const errors = useStore((s) => s.codeErrors);
  const [tab, setTab] = useState<'code' | 'preview'>('code');
  const [width, setWidth] = useState(() => Number(localStorage.getItem('mermaid-editor:code-width')) || 440);

  const startResize = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = width;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.max(280, Math.min(900, startW + ev.clientX - startX));
      setWidth(w);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      localStorage.setItem('mermaid-editor:code-width', String(w));
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <section className="code-panel" style={{ width }}>
      <header className="panel-head">
        <div className="tabs">
          <button className={tab === 'code' ? 'active' : ''} onClick={() => setTab('code')}>
            <Code2 size={16} /> Code
          </button>
          <button className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}>
            <Eye size={16} /> Vorschau
          </button>
        </div>
        <label className="toggle" title="Code-Änderungen sofort auf die Leinwand übernehmen">
          <input type="checkbox" checked={autoUpdate} onChange={(e) => useStore.getState().setAutoUpdate(e.target.checked)} />
          <span className="toggle-track" />
          Auto-Update
        </label>
        <button className="icon-btn" title="Code kopieren" onClick={copyCode}>
          <Copy size={16} />
        </button>
        <button className="icon-btn" title="Schließen (Strg+J)" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="panel-body" style={{ display: tab === 'code' ? 'flex' : 'none' }}>
        <Editor />
        {codeDirty && !autoUpdate && (
          <button className="apply-btn" onClick={() => useStore.getState().applyCode()}>
            <Check size={14} /> Auf Leinwand übernehmen (Strg+Enter)
          </button>
        )}
        {errors.length > 0 && (
          <div className="code-errors">
            {errors.map((e, i) => (
              <div key={i}>
                {e.line ? <b>Zeile {e.line}: </b> : null}
                {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
      {tab === 'preview' && <Preview />}
      <div className="resize-handle" onMouseDown={startResize} />
    </section>
  );
}
