import React from 'react';
import { Button } from '@/components/ui/Button';

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
        <Button type="button" onClick={action.onClick} className="mt-6">
          {action.label}
        </Button>
      )}
    </div>
  );
};
