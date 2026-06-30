import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';

interface LanguageSwitcherProps {
  showToast: (message: string) => void;
}

const LANGUAGES = [
  { code: 'zh', name: '简体中文', supported: true },
  { code: 'en', name: 'English', supported: true },
  { code: 'ja', name: '日本語', supported: false },
  { code: 'ko', name: '한국어', supported: false },
  { code: 'fr', name: 'Français', supported: false },
];

export function LanguageSwitcher({ showToast }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find(lang => lang.code === i18n.language) || LANGUAGES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelect = (lang: typeof LANGUAGES[0]) => {
    if (lang.supported) {
      i18n.changeLanguage(lang.code);
      localStorage.setItem('docker-dev-panel-lang', lang.code);
      setIsOpen(false);
    } else {
      showToast("Language pack is baking... Stay tuned!");
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 bg-slate-900/60 border border-slate-800 px-3 py-1.5 rounded-xl text-sm font-medium text-slate-300 transition-all duration-200",
          "hover:bg-slate-800/80 hover:border-slate-700 hover:text-slate-100 hover:shadow-[0_0_15px_rgba(34,211,238,0.1)]",
          isOpen && "bg-slate-800/80 border-cyan-500/40 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
        )}
      >
        <Globe className="w-4 h-4 text-cyan-500/70" />
        <span>{currentLang.name}</span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-slate-500 transition-transform duration-200",
            isOpen && "transform rotate-180 text-cyan-400"
          )}
        />
      </button>

      {/* Dropdown Panel */}
      <div
        className={cn(
          "absolute right-0 mt-2 w-48 rounded-xl bg-slate-900/80 backdrop-blur-xl border border-slate-800/60 shadow-2xl shadow-cyan-950/20 overflow-hidden z-50 transition-all duration-200 origin-top-right",
          isOpen ? "scale-100 opacity-100 pointer-events-auto" : "scale-95 opacity-0 pointer-events-none"
        )}
      >
        <div className="p-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleSelect(lang)}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all duration-200",
                lang.supported
                  ? lang.code === currentLang.code
                    ? "bg-cyan-500/10 text-cyan-400 font-bold"
                    : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                  : "text-slate-600 opacity-70 cursor-not-allowed hover:bg-slate-900"
              )}
            >
              <span>{lang.name}</span>
              {!lang.supported && (
                <span className="text-[10px] bg-slate-800/50 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-700/50">
                  Coming Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
