import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Open modals, in opening order. A modal opened later (e.g. a VConfirmDialog launched from a modal) always sits
 * above the ones already open, whatever overlayZIndex each one asks for, and only the top one closes with Escape.
 * Modals render in document.body so no parent stacking context (transform, z-index) can trap them.
 */
const openModals: { id: number; zIndex: number }[] = [];
/** z-index of the modal that contains this one in the React tree (a dialog rendered inside a modal goes above it). */
const ParentModalZ = createContext(0);
let nextModalId = 1;

function registerModal(requested: number): { id: number; zIndex: number } {
  const top = openModals.reduce((max, m) => Math.max(max, m.zIndex), 0);
  const entry = { id: nextModalId++, zIndex: Math.max(requested, top + 1) };
  openModals.push(entry);
  return entry;
}

function unregisterModal(id: number): void {
  const index = openModals.findIndex((m) => m.id === id);
  if (index >= 0) openModals.splice(index, 1);
}

function isTopModal(id: number): boolean {
  return openModals.length > 0 && openModals[openModals.length - 1].id === id;
}

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom' | 'fullscreen';
  className?: string;
  /** Por encima de modales anidados (p. ej. confirmaciones sobre InstanceEditModal z-55). */
  overlayZIndex?: number;
  /** Sin encabezado ni relleno: la ventana trae su propio encabezado (overlay, Escape y bloqueo de scroll siguen aquí). */
  bare?: boolean;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className = '',
  overlayZIndex = 50,
  bare = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const [stackEntry, setStackEntry] = useState<{ id: number; zIndex: number } | null>(null);
  const parentZ = useContext(ParentModalZ);
  const requestedZ = Math.max(overlayZIndex, parentZ + 1);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Place this modal on top of the ones already open while it is open
  useEffect(() => {
    if (!isOpen) return undefined;
    const entry = registerModal(requestedZ);
    setStackEntry(entry);
    return () => {
      unregisterModal(entry.id);
      setStackEntry(null);
    };
  }, [isOpen, requestedZ]);

  // Escape closes only the top modal; the page does not scroll while any modal is open
  useEffect(() => {
    if (!isOpen || !stackEntry) return undefined;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopModal(stackEntry.id)) onCloseRef.current();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (openModals.length === 0) document.body.style.overflow = 'unset';
    };
  }, [isOpen, stackEntry]);

  if (!isOpen) return null;

  // Mapa de tamaños predefinidos
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    custom: '',
    fullscreen: 'w-[98vw] h-[96vh]',
  };

  const zIndex = stackEntry?.zIndex ?? requestedZ;
  return createPortal(
    <ParentModalZ.Provider value={zIndex}>
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
    >
      {/* Backdrop (Fondo oscuro) */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Contenedor del Modal (max-h de seguridad; className puede traer ancho/alto propios, p. ej. pantalla completa) */}
      <div 
        ref={modalRef}
        className={`relative bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 ${size !== 'custom' ? sizeClasses[size] : ''} ${className}`}
        role="dialog"
        aria-modal="true"
      >
        {bare ? children : (<>
        {/* Header (Fijo) */}
        <div className="flex justify-between items-center p-4 border-b border-slate-100 shrink-0">
          <h3 className="font-bold text-lg text-slate-800">{title}</h3>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo (Flexible y Scrolleable) */}
        {/* AQUÍ ESTABA EL PROBLEMA: Agregamos 'flex-1 h-full flex flex-col' */}
        <div className="p-6 overflow-y-auto flex-1 h-full flex flex-col">
          {children}
        </div>
        </>)}
      </div>
    </div>
    </ParentModalZ.Provider>,
    document.body,
  );
};

export default Modal;