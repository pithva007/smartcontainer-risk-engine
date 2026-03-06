import { useEffect, useMemo, useRef, useState } from 'react';
import { Paperclip, Send, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_EMOJIS = ['✅', '⚠️', '📄', '📎', '👍', '🙏', '🚢', '🧾', '🕒'];

export default function MessageInput({
  disabled,
  onSend,
  onUpload,
  onTyping,
  onStopTyping,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
  onUpload: (file: File) => void;
  onTyping?: () => void;
  onStopTyping?: () => void;
}) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const typingTimer = useRef<number | null>(null);

  const canSend = useMemo(() => text.trim().length > 0 && !disabled, [text, disabled]);

  useEffect(() => {
    return () => {
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
    };
  }, []);

  const scheduleStopTyping = () => {
    if (!onStopTyping) return;
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => onStopTyping(), 900);
  };

  return (
    <div className="p-3 border-t border-border bg-card">
      {showEmoji && (
        <div className="mb-2 p-2 rounded-lg border border-border bg-foreground/5 flex flex-wrap gap-2">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="px-2 py-1 rounded hover:bg-foreground/10 text-sm"
              onClick={() => {
                setText((t) => t + e);
                setShowEmoji(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <button
          type="button"
          className={cn('p-2 rounded-lg border border-border hover:bg-foreground/5', disabled && 'opacity-50 cursor-not-allowed')}
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Upload attachment"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = '';
          }}
        />

        <button
          type="button"
          className={cn('p-2 rounded-lg border border-border hover:bg-foreground/5', disabled && 'opacity-50 cursor-not-allowed')}
          onClick={() => setShowEmoji((v) => !v)}
          disabled={disabled}
          title="Emoji"
        >
          <Smile className="w-4 h-4" />
        </button>

        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTyping?.();
            scheduleStopTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!canSend) return;
              onSend(text);
              setText('');
              setShowEmoji(false);
              onStopTyping?.();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          disabled={disabled}
          className="flex-1 resize-none bg-foreground/5 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
        />

        <button
          type="button"
          disabled={!canSend}
          className={cn(
            'px-3 py-2 rounded-lg border border-border bg-primary/20 text-primary hover:bg-primary/25 transition-colors flex items-center gap-2',
            !canSend && 'opacity-50 cursor-not-allowed'
          )}
          onClick={() => {
            if (!canSend) return;
            onSend(text);
            setText('');
            setShowEmoji(false);
            onStopTyping?.();
          }}
        >
          <Send className="w-4 h-4" />
          <span className="text-xs font-semibold">Send</span>
        </button>
      </div>
      <div className="mt-1 text-[10px] text-foreground/40">Enter to send • Shift+Enter for newline</div>
    </div>
  );
}

