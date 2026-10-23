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
    /** Quick add: offers "+ <createLabel(text)>" when the typed text matches no item; the value may then be outside items. */
    onCreate?: (text: string) => void;
    createLabel?: (text: string) => string;
    /** Entity search (checklist): suggestions from this many characters, at most maxResults of them. */
    minChars?: number;
    maxResults?: number;
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
    onCreate,
    createLabel = (text) => `Dar de alta «${text}»`,
    minChars = 0,
    maxResults,
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

    // A quick-added value is not in items yet: show it as typed
    const selectedLabel = selectedItem ? getLabel(selectedItem) : (onCreate ? value : '');

    const filteredItems = useMemo(() => {
        const normalizedDraft = normalizeText(draft.trim());
        if (normalizedDraft.length < minChars) return [];
        const matches = normalizedDraft
            ? items.filter((item) => normalizeText(getLabel(item)).includes(normalizedDraft))
            : items;
        return maxResults ? matches.slice(0, maxResults) : matches;
    }, [items, draft, getLabel, minChars, maxResults]);

    const createText = draft.trim();
    const canCreate = Boolean(onCreate) && createText.length >= Math.max(minChars, 2)
        && !items.some((item) => normalizeText(getLabel(item)) === normalizeText(createText)
            || normalizeText(getValue(item)) === normalizeText(createText));

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
                    {filteredItems.length === 0 && !canCreate ? (
                        <li className="px-3 py-2 text-sm text-slate-400 italic">
                            {draft.trim().length < minChars ? `Escribe al menos ${minChars} caracteres` : 'Sin resultados'}
                        </li>
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
                    {canCreate && (
                        <li role="option" aria-selected={false}>
                            <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-50"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => { onCreate?.(createText); setIsOpen(false); }}
                            >
                                + {createLabel(createText)}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}

export default SearchableSelect;
