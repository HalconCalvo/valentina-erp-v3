import React from 'react';

// Extendemos de HTMLAttributes para aceptar onClick, onMouseEnter, etc.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

// Usamos "...props" para capturar el onClick y pasárselo al div
const Card: React.FC<CardProps> = ({ children, className = '', ...props }) => {
  return (
    <div 
        className={`bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow ${className}`}
        {...props} // <--- Aquí es donde ocurre la magia: pasamos el onClick al div real
    >
      {children}
    </div>
  );
};

export default Card;