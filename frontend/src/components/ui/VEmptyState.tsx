import React from 'react';

interface VEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const VEmptyState: React.FC<VEmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 text-slate-300 [&_svg]:size-12">
          {icon}
        </div>
      )}

      <h3 className="text-base font-bold text-slate-600">{title}</h3>

      {description && (
        <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-6 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};
