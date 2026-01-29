import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'secondary' | 'info';
}

const Badge: React.FC<BadgeProps> = ({ children, variant = 'secondary' }) => {
  const styles = {
    success: "bg-emerald-100 text-emerald-700 border-emerald-200",
    warning: "bg-amber-100 text-amber-700 border-amber-200",
    danger: "bg-red-100 text-red-700 border-red-200",
    secondary: "bg-slate-100 text-slate-600 border-slate-200",
    info: "bg-blue-100 text-blue-700 border-blue-200",
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles[variant]}`}>
      {children}
    </span>
  );
};

export default Badge;