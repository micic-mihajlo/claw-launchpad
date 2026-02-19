import { useEffect, useState } from "react";
import { shortToken } from "../app/authToken";
import { Modal } from "./Modal";

export function AuthModal(props: {
  open: boolean;
  token: string;
  onSave: (token: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(props.token);

  useEffect(() => {
    if (props.open) setDraft(props.token);
  }, [props.open, props.token]);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;

  return (
    <Modal open={props.open} title="Workspace Access Token" onClose={props.onClose}>
      <div className="field">
        <label className="label">API bearer token</label>
        <input
          className="input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste token or leave blank to operate without auth"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <div className="hint">
          The token is sent as <span className="monoInline">Authorization: Bearer</span> on protected requests.
        </div>
      </div>

      <div className="field">
        <div className="row">
          <button className="btn btnPrimary" onClick={() => props.onSave(trimmed)} disabled={!canSave}>
            Save token
          </button>
          <button className="btn" onClick={props.onClear} disabled={!props.token}>
            Clear token
          </button>
        </div>
        <div className="hint hintSpacingTop">
          Stored token: <span className="monoInline">{shortToken(props.token)}</span>
        </div>
      </div>
    </Modal>
  );
}
