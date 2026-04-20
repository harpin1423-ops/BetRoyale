import React from 'react';
import { ChevronDown } from 'lucide-react';

interface CustomSelectProps {
  value: string | number;
  onChange: (name: string, value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  name?: string;
  required?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ 
  value, 
  onChange, 
  onKeyDown,
  children,
  className = "",
  name,
  required
}) => {
  return (
    <div className={`relative ${className}`}>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(name || "", e.target.value)}
        onKeyDown={onKeyDown}
        required={required}
        className="w-full bg-background border border-white/10 rounded-xl px-5 py-4 text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all appearance-none cursor-pointer text-foreground shadow-sm hover:border-white/20"
      >
        {children}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary pointer-events-none" />
    </div>
  );
};
