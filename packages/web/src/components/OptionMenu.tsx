import { useEffect, useRef, useState } from 'react';

export interface Option {
  id: string;
  label: string;
  hint?: string;
}

/** small dropdown pill menu used for model/effort/speed/perm/mode pickers */
export default function OptionMenu({ label, options, value, onChange, disabled }: {
  label: React.ReactNode;
  options: Option[];
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (options.length === 0) return null;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-[12.5px] font-medium text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors max-w-[180px]"
      >
        <span className="truncate">{label}</span>
        <span className="text-zinc-400 text-[10px] flex-none">▾</span>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 left-0 z-30 min-w-[200px] max-w-[280px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-1.5 fade-up max-h-72 overflow-y-auto">
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-xl text-[13px] transition-colors ${value === o.id ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}`}
            >
              <div className="truncate">{o.label}</div>
              {o.hint && <div className="text-[11px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">{o.hint}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
