import type { WorkflowDef } from '../../types';
import { palette, zincAlpha } from '../../theme';

export function WorkflowSelector({ defs, selected, onSelect }: {
  defs: WorkflowDef[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={selected || ''}
        onChange={e => onSelect(e.target.value || null)}
        className="px-3 py-1.5 rounded-lg text-[13px] bg-transparent border transition-colors"
        style={{ borderColor: zincAlpha(0.2), color: palette.white }}
      >
        <option value="">All Workflows</option>
        {defs.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
    </div>
  );
}
