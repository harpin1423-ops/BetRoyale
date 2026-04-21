import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';

export interface SearchableOption {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  size?: "md" | "sm";
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Seleccionar...",
  className = "",
  required = false,
  disabled = false,
  size = "md"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Encontrar la opción seleccionada actualmente
  const selectedOption = useMemo(() => {
    return options.find(opt => opt.value.toString() === value?.toString());
  }, [options, value]);

  // Filtrar opciones basado en la búsqueda
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(opt => 
      opt.label.toLowerCase().includes(query) || 
      opt.value.toString().toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Enfocar el input cuando se abre
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!isOpen) {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelect = (option: SearchableOption) => {
    onChange(option.value.toString());
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={containerRef}>
      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full bg-background border border-white/10 rounded-2xl flex items-center justify-between cursor-pointer transition-all hover:border-white/20",
          size === "sm" ? "px-3 py-2 text-xs rounded-xl" : "px-5 py-4 text-sm",
          isOpen && "border-primary ring-4 ring-primary/10",
          disabled && "opacity-50 cursor-not-allowed grayscale",
          !selectedOption && "text-muted-foreground/30"
        )}
      >
        <div className="flex items-center gap-3 truncate">
          {selectedOption?.icon}
          <span className={cn("truncate font-medium", selectedOption ? "text-foreground" : "")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-primary transition-transform ml-2 shrink-0", isOpen && "rotate-180")} />
      </div>

      {/* Hidden input for HTML form validation if required */}
      {required && (
        <input
          type="text"
          value={value || ""}
          required
          tabIndex={-1}
          className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
          onChange={() => {}}
        />
      )}

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute z-50 mt-2 w-full bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Search Input */}
            <div className="p-3 border-b border-white/5 bg-white/5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Buscar..."
                  className="w-full bg-background/50 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && filteredOptions.length > 0) {
                      e.preventDefault();
                      handleSelect(filteredOptions[0]);
                    }
                    if (e.key === 'Escape') {
                      setIsOpen(false);
                    }
                  }}
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto py-2 custom-scrollbar">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <div
                    key={option.value}
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "px-4 py-3 text-sm flex items-center justify-between cursor-pointer transition-colors",
                      value?.toString() === option.value.toString() 
                        ? "bg-primary/20 text-primary font-bold" 
                        : "text-foreground/70 hover:bg-white/5"
                    )}
                  >
                    <div className="flex items-center gap-3 truncate">
                      {option.icon}
                      <span className="truncate">{option.label}</span>
                    </div>
                    {value?.toString() === option.value.toString() && (
                      <Check className="w-4 h-4 shrink-0" />
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                  No se encontraron resultados
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
