import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { findHelp, HELP_SECTIONS, type HelpBlock } from './helpContent';

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

/** Help of the screen that is open (texts in help/ayuda.md). */
export const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const section = findHelp(HELP_SECTIONS, pathname);

    const openManual = () => {
        onClose();
        navigate('/help');
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Ayuda de esta pantalla" size="lg">
            <div className="space-y-3">
                {section ? (
                    section.blocks.map((block, i) => <Block key={i} block={block} />)
                ) : (
                    <p className="text-sm text-slate-600">
                        Esta pantalla todavía no tiene ayuda escrita. Mientras tanto puedes consultar el manual general.
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
