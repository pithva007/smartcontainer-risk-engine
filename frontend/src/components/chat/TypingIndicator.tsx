export default function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="text-[11px] text-foreground/50 px-3 py-1">
      {name} is typing…
    </div>
  );
}

