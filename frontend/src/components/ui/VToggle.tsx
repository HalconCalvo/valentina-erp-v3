import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface VToggleProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: string;
    description?: string;
    disabled?: boolean;
    className?: string;
    id?: string;
}

export const VToggle: React.FC<VToggleProps> = ({
    checked,
    onCheckedChange,
    label,
    description,
    disabled = false,
    className = '',
    id,
}) => {
    const generatedToggleId = React.useId();
    const toggleId = id ?? generatedToggleId;

    return (
        <div className={cn('flex items-start justify-between gap-3', className)}>
            {(label || description) && (
                <div className="flex flex-col gap-0.5">
                    {label && (
                        <Label htmlFor={toggleId} className="text-sm font-bold text-slate-700 cursor-pointer">
                            {label}
                        </Label>
                    )}
                    {description && (
                        <p className="text-xs text-slate-500">{description}</p>
                    )}
                </div>
            )}
            <SwitchPrimitive.Root
                id={toggleId}
                checked={checked}
                onCheckedChange={onCheckedChange}
                disabled={disabled}
                className={cn(
                    'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'data-[state=checked]:bg-indigo-600 data-[state=unchecked]:bg-slate-200',
                )}
            >
                <SwitchPrimitive.Thumb
                    className={cn(
                        'pointer-events-none block size-5 rounded-full bg-white shadow-sm ring-0 transition-transform',
                        'data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0',
                    )}
                />
            </SwitchPrimitive.Root>
        </div>
    );
};
