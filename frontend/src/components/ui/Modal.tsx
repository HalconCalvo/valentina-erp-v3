import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'custom';
  className?: string;
}

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  className = '' 
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Cerrar con tecla Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Evitar scroll en el body principal cuando el modal está abierto
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Mapa de tamaños predefinidos
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    custom: '' 
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop (Fondo oscuro) */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />
      
      {/* Contenedor del Modal */}
      <div 
        ref={modalRef}
        className={`
            relative bg-white rounded-xl shadow-2xl w-full flex flex-col
            max-h-[90vh] /* Altura máxima de seguridad */
            animate-in fade-in zoom-in duration-200
            ${size !== 'custom' ? sizeClasses[size] : ''} 
            ${className} /* Aquí entra el w-[95vw] y h-[90vh] que mandamos desde fuera */
        `}
        role="dialog"
        aria-modal="true"
      >
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
      </div>
    </div>
  );
};

export default Modal;