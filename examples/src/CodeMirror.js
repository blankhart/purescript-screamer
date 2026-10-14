// CodeMirror 6 behind a small imperative interface for CodeMirror.purs.
import { EditorView, basicSetup } from 'codemirror';
import { Annotation, Compartment, EditorState } from '@codemirror/state';

// Marks the transactions the wrapper dispatches itself, so they are not
// reported back as edits.
const external = Annotation.define();

export const createImpl = (host) => (initial) => (onChange) => () => {
  const editable = new Compartment();
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc: initial,
      extensions: [
        basicSetup,
        editable.of(EditorState.readOnly.of(false)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(external))) {
            onChange(update.state.doc.toString())();
          }
        }),
      ],
    }),
  });
  return {
    setText: (text) => () => {
      // Only when it differs, so the user's own edits do not loop back and
      // move the caret.
      if (view.state.doc.toString() === text) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, annotations: external.of(true) });
    },
    setReadOnly: (readOnly) => () => {
      view.dispatch({ effects: editable.reconfigure(EditorState.readOnly.of(readOnly)) });
    },
    destroy: () => view.destroy(),
  };
};
