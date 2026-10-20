import * as React from 'react';
import { cn } from '@/lib/utils';

/** Long text (Observaciones, Notas, Motivo): same look as Input, several lines (guide v2). */
const VTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      data-slot="textarea"
      className={cn(
        'w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm resize-y',
        className,
      )}
      {...props}
    />
  ),
);
VTextarea.displayName = 'VTextarea';

export { VTextarea };
