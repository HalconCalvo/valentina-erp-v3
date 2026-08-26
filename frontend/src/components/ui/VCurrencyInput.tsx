import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface VCurrencyInputProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  min?: number;
  className?: string;
}

const formatCurrency = (num: number): string =>
  num.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const sanitizeInput = (input: string): string => {
  let result = '';
  let hasDot = false;

  for (const char of input) {
    if (char >= '0' && char <= '9') {
      result += char;
    } else if (char === '.' && !hasDot) {
      hasDot = true;
      result += char;
    }
  }

  return result;
};

const parseDisplayValue = (raw: string): number => {
  if (raw === '' || raw === '.') return 0;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const VCurrencyInput: React.FC<VCurrencyInputProps> = ({
  value,
  onChange,
  label,
  placeholder = '0.00',
  disabled = false,
  required = false,
  error,
  min,
  className,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatCurrency(value));

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(formatCurrency(value));
    }
  }, [value, isFocused]);

  const applyMin = (num: number): number =>
    min !== undefined ? Math.max(num, min) : num;

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(value === 0 ? '' : String(value));
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeInput(event.target.value);
    setDisplayValue(sanitized);
    onChange(applyMin(parseDisplayValue(sanitized)));
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = applyMin(parseDisplayValue(displayValue));
    onChange(parsed);
    setDisplayValue(formatCurrency(parsed));
  };

  const inputId = label ? `vcurrency-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={inputId} className="text-slate-700">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </Label>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
          $
        </span>
        <Input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          className={cn(
            'pl-7',
            error &&
              'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/20',
          )}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
};
