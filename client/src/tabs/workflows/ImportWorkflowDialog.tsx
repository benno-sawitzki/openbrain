import { useState } from 'react';
import { createWorkflowDef } from '../../api';
import { palette, accentAlpha, zincAlpha } from '../../theme';

export function ImportWorkflowDialog({ onClose, onImported, notify }: {
  onClose: () => void;
  onImported: () => void;
  notify: (msg: string) => void;
}) {
  const [jsonText, setJsonText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleImport = async () => {
    setSubmitting(true);
    try {
      const def = JSON.parse(jsonText);
      if (!def.name || !def.steps) throw new Error('Missing name or steps');
      await createWorkflowDef(def);
      notify('Workflow imported');
      onImported();
      onClose();
    } catch (e: any) {
      notify(`Import failed: ${e.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card rounded-xl p-5 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <div className="text-[14px] font-semibold">Import Workflow Definition</div>
        <textarea value={jsonText} onChange={e => setJsonText(e.target.value)}
          placeholder='Paste workflow JSON...'
          rows={12}
          className="w-full px-3 py-2 rounded-lg text-[12px] font-mono bg-transparent border resize-none"
          style={{ borderColor: zincAlpha(0.2), color: palette.white }}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-[12px] text-muted-foreground hover:bg-white/[0.03] transition-colors">
            Cancel
          </button>
          <button onClick={handleImport} disabled={submitting || !jsonText.trim()}
            className="px-4 py-1.5 rounded-lg text-[12px] font-medium transition-colors disabled:opacity-50"
            style={{ background: accentAlpha(0.15), color: palette.accent }}>
            {submitting ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
