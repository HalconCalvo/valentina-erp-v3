import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { findHelp, HELP_SECTIONS, searchHelp, type HelpBlock, type HelpSearchResult } from './helpContent';

/** **bold** → <strong>; the rest stays as plain text. */
function Rich({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
        <>
            {parts.map((part, i) =>
                part.startsWith('**') && part.endsWith('**')
                    ? <strong key={i} className="font-bold text-slate-800">{part.slice(2, -2)}</strong>
                    : <React.Fragment key={i}>{part}</React.Fragment>,
            )}
        </>
    );
}

function Block({ block }: { block: HelpBlock }) {
    switch (block.kind) {
        case 'title':
            return <h2 className="text-xl font-black text-slate-800">{block.text}</h2>;
        case 'task':
            return <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 pt-2">{block.text}</h3>;
        case 'paragraph':
            return <p className="text-sm text-slate-600 leading-relaxed"><Rich text={block.text} /></p>;
        case 'steps':
            return (
                <ol className="list-decimal pl-5 space-y-1 text-sm text-slate-600">
                    {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
                </ol>
            );
        case 'bullets':
            return (
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    {block.items.map((item, i) => <li key={i}><Rich text={item} /></li>)}
                </ul>
            );
    }
}

interface HelpPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/** One task found by the search: its screen, its steps on demand and a link to go there. */
function ResultItem({ result, onGo }: { result: HelpSearchResult; onGo: (route: string) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <li className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
                <button type="button" onClick={() => setOpen((v) => !v)} className="flex flex-1 items-start gap-2 text-left">
                    {open ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-slate-400" />
                        : <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                    <span>
                        <span className="block text-sm font-bold text-slate-800">{result.task.title}</span>
                        <span className="block text-xs text-slate-500">{result.screen}</span>
                    </span>
                </button>
                <Button type="button" variant="outline" size="xs" onClick={() => onGo(result.route)}
                    title={`Ir a ${result.screen}`}>
                    Ir <ArrowRight size={14} />
                </Button>
            </div>
            {open && (
                <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                    {result.task.blocks.map((block, i) => <Block key={i} block={block} />)}
                </div>
            )}
        </li>
    );
}

/** Help of the screen that is open (texts in help/ayuda.md), and D38 search across the screens the role can open. */
export const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const section = findHelp(HELP_SECTIONS, pathname);
    const [query, setQuery] = useState('');
    const role = (localStorage.getItem('user_role') || '').toUpperCase().trim();
    const results = query.trim() ? searchHelp(HELP_SECTIONS, query, role) : [];

    useEffect(() => {
        if (isOpen) setQuery('');
    }, [isOpen]);

    const openManual = () => {
        onClose();
        navigate('/help');
    };

    const goTo = (route: string) => {
        onClose();
        navigate(route);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ayuda" size="lg">
            <div className="space-y-3">
                <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
                    placeholder="¿En qué te ayudo? (p. ej. comisiones, orden de compra, bancos)" />
                {query.trim() ? (
                    results.length ? (
                        <ul className="space-y-2">
                            {results.map((r) => <ResultItem key={`${r.route}-${r.task.title}`} result={r} onGo={goTo} />)}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-600">
                            No encontré ayuda para "{query.trim()}" en las pantallas de tu puesto. Prueba con otra palabra.
                        </p>
                    )
                ) : section ? (
                    section.blocks.map((block, i) => <Block key={i} block={block} />)
                ) : (
                    <p className="text-sm text-slate-600">
                        Esta pantalla todavía no tiene ayuda escrita. Escribe arriba lo que buscas o consulta el manual general.
                    </p>
                )}
                <div className="flex justify-end pt-4 border-t border-slate-100">
                    <Button variant="outline" onClick={openManual}>
                        <BookOpen size={16} /> Manual general
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
