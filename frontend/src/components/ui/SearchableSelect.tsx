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
    const inputRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState({ top: 0, left: 0, width: 0 });

    const selectedItem = useMemo(
        () => items.find((item) => getValue(item) === value) ?? null,
        [items, value, getValue],
    );

    const selectedLabel = selectedItem ? getLabel(selectedItem) : '';

    const filteredItems = useMemo(() => {
        const normalizedDraft = normalizeText(draft);
        if (!normalizedDraft) return items;
        return items.filter((item) =>
            normalizeText(getLabel(item)).includes(normalizedDraft),
        );
    }, [items, draft, getLabel]);

    const updateDropdownPosition = () => {
        const rect = inputRef.current?.getBoundingClientRect();
        if (rect) {
            setDropdownStyle({
                top: rect.bottom,
                left: rect.left,
                width: rect.width,
            });
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updateDropdownPosition();
        const handleReposition = () => updateDropdownPosition();
        window.addEventListener('scroll', handleReposition, true);
        window.addEventListener('resize', handleReposition);
        return () => {
            window.removeEventListener('scroll', handleReposition, true);
            window.removeEventListener('resize', handleReposition);
        };
    }, [isOpen]);

    const openDropdown = () => {
        if (disabled) return;
        setDraft('');
        updateDropdownPosition();
        setIsOpen(true);
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setDraft(event.target.value);
        if (!isOpen) {
            updateDropdownPosition();
            setIsOpen(true);
        }
    };

    const handleSelect = (item: T) => {
        onChange(getValue(item));
        setIsOpen(false);
    };

    const handleBlur = () => {
        window.setTimeout(() => {
            setIsOpen(false);
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

    const displayValue = isOpen ? draft : selectedLabel;

    return (
        <div ref={containerRef} className="relative w-full">
            <input
                ref={inputRef}
                type="text"
                value={displayValue}
                onChange={handleInputChange}
                onFocus={openDropdown}
                onClick={openDropdown}
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
                    style={{
                        position: 'fixed',
                        top: dropdownStyle.top + 4,
                        left: dropdownStyle.left,
                        width: dropdownStyle.width,
                        zIndex: 9999,
                    }}
                    className="max-h-[13rem] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg py-1"
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
