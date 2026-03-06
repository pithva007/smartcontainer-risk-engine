import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { ConversationListItem, ConversationStatus } from '@/types/chatTypes';
import { cn } from '@/lib/utils';
import ConversationItem from './ConversationItem';

const FILTERS: Array<{ key: 'all' | ConversationStatus; label: string }> = [
  { key: 'all', label: 'Open' },
  { key: 'Pending Documents', label: 'Pending Documents' },
  { key: 'Resolved', label: 'Resolved' },
];

export default function ConversationList({
  items,
  activeConversationId,
  onSelect,
  onSearchChange,
  onFilterChange,
  filter,
  search,
}: {
  items: ConversationListItem[];
  activeConversationId: string | null;
  onSelect: (c: ConversationListItem) => void;
  onSearchChange: (q: string) => void;
  onFilterChange: (s: ConversationStatus | undefined) => void;
  filter?: ConversationStatus;
  search?: string;
}) {
  const [localSearch, setLocalSearch] = useState(search || '');

  const activeKey = useMemo(() => filter ?? 'Open', [filter]);

  return (
    <div className="w-[320px] border-r border-border bg-card flex flex-col">
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value);
              onSearchChange(e.target.value);
            }}
            placeholder="Search by Container_ID"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-foreground/5 border border-border text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
        <div className="mt-3 flex gap-2">
          {FILTERS.map((f) => {
            const isActive = (f.key === 'all' && activeKey === 'Open') || (f.key !== 'all' && f.key === activeKey);
            return (
              <button
                key={f.label}
                type="button"
                onClick={() => onFilterChange(f.key === 'all' ? 'Open' : f.key)}
                className={cn(
                  'text-[11px] px-2 py-1 rounded-full border border-border hover:bg-foreground/5',
                  isActive && 'border-primary/40 bg-primary/10 text-primary'
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.length === 0 ? (
          <div className="text-xs text-foreground/50 px-2 py-6">No conversations found.</div>
        ) : (
          items.map((it) => (
            <ConversationItem
              key={it.conversation_id}
              item={it}
              active={activeConversationId === it.conversation_id}
              onClick={() => onSelect(it)}
            />
          ))
        )}
      </div>
    </div>
  );
}

