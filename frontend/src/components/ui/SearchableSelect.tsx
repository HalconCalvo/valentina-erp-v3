import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableSelectProps<T> {
    items: T[];
    value: string;
    onChange: (value: string) => void;
    getLabel: (item: T) => string;
    getValue: (item: T) => string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

function normalizeText(text: string): string {
    return text
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function SearchableSelect<T>({
    items,
    value,
    onChange,
    getLabel,
    getValue,
    placeholder = 'Buscar...',
    disabled = false,
    className = '',
}: SearchableSelectProps<T>) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [draft, setDraft] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    const selectedItem = useMemo(
        () => items.find((item) => getValue(item) === value) ?? null,
        [items, value, getValue],
    );

    const selectedLabel = selectedItem ? getLabel(selectedItem) : '';

    useEffect(() => {
        if (!isOpen) {
            setDraft(value ? selectedLabel : '');
        }
    }, [value, selectedLabel, isOpen]);

    const filteredItems = useMemo(() => {
        const normalizedDraft = normalizeText(draft);
        if (!normalizedDraft) return items;
        return items.filter((item) =>
            normalizeText(getLabel(item)).includes(normalizedDraft),
        );
    }, [items, draft, getLabel]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setDraft(value ? selectedLabel : '');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [value, selectedLabel]);

    const handleFocus = () => {
        if (disabled) return;
        setIsOpen(true);
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const next = event.target.value;
        setDraft(next);
        setIsOpen(true);
        if (value) onChange('');
    };

    const handleSelect = (item: T) => {
        onChange(getValue(item));
        setDraft(getLabel(item));
        setIsOpen(false);
    };

    const handleBlur = () => {
        window.setTimeout(() => {
            setIsOpen(false);
            setDraft(value ? selectedLabel : '');
        }, 150);
    };

    const inputClassName = [
        'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white',
        'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div ref={containerRef} className="relative w-full">
            <input
                type="text"
                value={draft}
                onChange={handleInputChange}
                onFocus={handleFocus}
                onBlur={handleBlur}
                disabled={disabled}
                placeholder={placeholder}
                className={inputClassName}
                autoComplete="off"
                role="combobox"
                aria-expanded={isOpen}
                aria-autocomplete="list"
            />
            {isOpen && !disabled && (
                <ul
                    className="absolute z-50 mt-1 w-full max-h-[13rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
                    role="listbox"
                >
                    {filteredItems.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-slate-400 italic">Sin resultados</li>
                    ) : (
                        filteredItems.map((item) => {
                            const itemValue = getValue(item);
                            const label = getLabel(item);
                            const isSelected = itemValue === value;
                            return (
                                <li key={itemValue} role="option" aria-selected={isSelected}>
                                    <button
                                        type="button"
                                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                                            isSelected
                                                ? 'bg-indigo-50 font-semibold text-indigo-800'
                                                : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                                        }`}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleSelect(item)}
                                    >
                                        {label}
                                    </button>
                                </li>
                            );
                        })
                    )}
                </ul>
            )}
        </div>
    );
}

export default SearchableSelect;
