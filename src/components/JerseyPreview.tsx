import React, { useState, useEffect } from 'react';
import { Shirt, Sparkles, RefreshCw, Layers } from 'lucide-react';
import { cn } from '../lib/utils';

interface Preset {
  id: string;
  name: string;
  bgClass: string; // for the preview dot
  jerseyColor: string;
  collarColor: string;
  fontColor: string;
  accentColor: string;
  style: 'solid' | 'striped' | 'hooped';
}

const PRESETS: Preset[] = [
  {
    id: 'black-gold',
    name: 'Club Black & Gold',
    bgClass: 'bg-slate-900 border border-amber-500',
    jerseyColor: '#0f172a', // Slate-900
    collarColor: '#f59e0b', // Amber-500
    fontColor: '#fbbf24', // Amber-400
    accentColor: '#fbbf24',
    style: 'solid'
  },
  {
    id: 'red-white',
    name: 'Flamengo Classic',
    bgClass: 'bg-red-600 border border-slate-900',
    jerseyColor: '#dc2626', // Red-600
    collarColor: '#0f172a', // Slate-900
    fontColor: '#ffffff', // White
    accentColor: '#0f172a',
    style: 'striped'
  },
  {
    id: 'white-black',
    name: 'Vasco Clean',
    bgClass: 'bg-slate-50 border border-slate-900',
    jerseyColor: '#f8fafc', // Slate-50
    collarColor: '#0f172a', // Slate-900
    fontColor: '#0f172a', // Slate-900
    accentColor: '#e2e8f0',
    style: 'solid'
  },
  {
    id: 'green-gold',
    name: 'Palmeiras Premium',
    bgClass: 'bg-emerald-800 border border-amber-400',
    jerseyColor: '#064e3b', // Emerald-900
    collarColor: '#fbbf24', // Amber-400
    fontColor: '#fbbf24', // Amber-400
    accentColor: '#064e3b',
    style: 'solid'
  },
  {
    id: 'blue-white',
    name: 'Cruzeiro Stars',
    bgClass: 'bg-blue-600 border border-slate-100',
    jerseyColor: '#2563eb', // Blue-600
    collarColor: '#ffffff', // White
    fontColor: '#ffffff', // White
    accentColor: '#1d4ed8',
    style: 'solid'
  },
  {
    id: 'yellow-green',
    name: 'Canarinha',
    bgClass: 'bg-yellow-400 border border-green-600',
    jerseyColor: '#facc15', // Yellow-400
    collarColor: '#16a34a', // Green-600
    fontColor: '#16a34a', // Green-600
    accentColor: '#22c55e',
    style: 'solid'
  }
];

interface JerseyPreviewProps {
  name: string;
  number: string;
  productName?: string;
  onColorChange?: (jerseyColor: string, fontColor: string) => void;
}

export const JerseyPreview: React.FC<JerseyPreviewProps> = ({
  name,
  number,
  productName = '',
  onColorChange
}) => {
  const [activePreset, setActivePreset] = useState<Preset>(PRESETS[0]);
  const [style, setStyle] = useState<'solid' | 'striped' | 'hooped'>(PRESETS[0].style);

  // Auto-detect color preset based on product name context if provided
  useEffect(() => {
    if (!productName) return;
    const lowerName = productName.toLowerCase();
    
    let matchedPreset = PRESETS[0];
    if (lowerName.includes('branc') || lowerName.includes('white') || lowerName.includes('reserva')) {
      matchedPreset = PRESETS.find(p => p.id === 'white-black') || PRESETS[2];
    } else if (lowerName.includes('flamengo') || lowerName.includes('vermelh') || lowerName.includes('rubro')) {
      matchedPreset = PRESETS.find(p => p.id === 'red-white') || PRESETS[1];
    } else if (lowerName.includes('verd') || lowerName.includes('palmeiras') || lowerName.includes('green')) {
      matchedPreset = PRESETS.find(p => p.id === 'green-gold') || PRESETS[3];
    } else if (lowerName.includes('azul') || lowerName.includes('cruzeiro') || lowerName.includes('blue')) {
      matchedPreset = PRESETS.find(p => p.id === 'blue-white') || PRESETS[4];
    } else if (lowerName.includes('brasil') || lowerName.includes('amarel') || lowerName.includes('yellow')) {
      matchedPreset = PRESETS.find(p => p.id === 'yellow-green') || PRESETS[5];
    } else if (lowerName.includes('pret') || lowerName.includes('black')) {
      matchedPreset = PRESETS.find(p => p.id === 'black-gold') || PRESETS[0];
    }

    setActivePreset(matchedPreset);
    setStyle(matchedPreset.style);
  }, [productName]);

  const handlePresetSelect = (preset: Preset) => {
    setActivePreset(preset);
    setStyle(preset.style);
    if (onColorChange) {
      onColorChange(preset.jerseyColor, preset.fontColor);
    }
  };

  const handleStyleCycle = () => {
    const styles: ('solid' | 'striped' | 'hooped')[] = ['solid', 'striped', 'hooped'];
    const idx = styles.indexOf(style);
    const nextStyle = styles[(idx + 1) % styles.length];
    setStyle(nextStyle);
  };

  // Safe checks for typed inputs
  const formattedName = (name || 'SEU NOME').trim().toUpperCase();
  const formattedNumber = (number || '10').trim().slice(0, 2);

  return (
    <div className="bg-slate-900 border border-white/5 rounded-2xl p-4 flex flex-col items-center gap-4 shadow-xl overflow-hidden relative">
      {/* Absolute Decorative Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-16 bg-red-800/10 rounded-full blur-2xl pointer-events-none" />

      {/* Title & Badge */}
      <div className="flex items-center justify-between w-full border-b border-white/5 pb-2">
        <div className="flex items-center gap-1.5">
          <Shirt size={12} className="text-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase text-white/80 tracking-widest">LIVE MANT CANVAS</span>
        </div>
        <span className="text-[7.5px] font-mono text-red-500 bg-red-500/10 border border-red-500/20 rounded px-1.5 py-0.5 animate-pulse uppercase tracking-wider">
          Visualização 3D Lite
        </span>
      </div>

      {/* Drawing Stage */}
      <div className="w-full max-w-[160px] h-[190px] bg-slate-950 rounded-2xl relative flex items-center justify-center border border-white/5 shadow-inner group/stage">
        
        {/* Subtle grid mesh background behind stage to enhance CAD/blueprint look */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:8px_8px] pointer-events-none rounded-2xl" />

        <svg 
          width="100%" 
          height="100%" 
          viewBox="0 0 200 240" 
          className="drop-shadow-[0_12px_24px_rgba(0,0,0,0.6)] group-hover/stage:scale-[1.03] transition-transform duration-500 ease-out"
        >
          <defs>
            {/* Curved textPath for back player names */}
            <path id="backNameCurve" d="M 32,60 Q 100,28 168,60" fill="none" />
            
            {/* Real fabric ventilation points texture pattern */}
            <pattern id="meshVentilation" width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1" fill="#ffffff" fillOpacity="0.08" />
            </pattern>

            {/* Vertical design stripe masks */}
            <pattern id="jerseyVerticalStripes" width="40" height="240" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="16" height="240" fill="#ffffff" fillOpacity="0.12" />
              <rect x="25" y="0" width="6" height="240" fill="#ffffff" fillOpacity="0.06" />
            </pattern>

            {/* Horizontal hooped patterns */}
            <pattern id="jerseyHorizontalHoops" width="200" height="30" patternUnits="userSpaceOnUse">
              <rect x="0" y="0" width="200" height="12" fill="#ffffff" fillOpacity="0.12" />
            </pattern>
          </defs>

          {/* MAIN SHIRT CASE PATH WITH REFINED ATHLETIC GEOMETRY */}
          <path 
            id="shirtBody"
            d="M 50,25 
               C 65,12 135,12 150,25 
               L 185,45 
               C 190,48 190,55 185,58 
               L 165,72 
               C 162,74 158,72 158,68 
               L 158,220 
               C 158,224 154,228 150,228 
               L 50,228 
               C 46,228 42,224 42,220 
               L 42,68 
               C 42,72 38,74 35,72 
               L 15,58 
               C 10,55 10,48 15,45 
               Z" 
            fill={activePreset.jerseyColor} 
            stroke={activePreset.collarColor}
            strokeWidth="2.5"
            strokeLinejoin="round"
            className="transition-all duration-300"
          />

          {/* PATTERN OVERLAYS */}
          {style === 'striped' && (
            <path 
              d="M 50,25 C 65,12 135,12 150,25 L 185,45 C 190,48 190,55 185,58 L 165,72 C 162,74 158,72 158,68 L 158,220 C 158,224 154,228 150,228 L 50,228 C 46,228 42,224 42,220 L 42,68 C 42,72 38,74 35,72 L 15,58 C 10,55 10,48 15,45 Z" 
              fill="url(#jerseyVerticalStripes)"
              mask="url(#shirtBody)"
              className="pointer-events-none"
            />
          )}

          {style === 'hooped' && (
            <path 
              d="M 50,25 C 65,12 135,12 150,25 L 185,45 C 190,48 190,55 185,58 L 165,72 C 162,74 158,72 158,68 L 158,220 C 158,224 154,228 150,228 L 50,228 C 46,228 42,224 42,220 L 42,68 C 42,72 38,74 35,72 L 15,58 C 10,55 10,48 15,45 Z" 
              fill="url(#jerseyHorizontalHoops)"
              className="pointer-events-none"
            />
          )}

          {/* DRY-FIT VENTILATED FABRIC MESH OVERLAY */}
          <path 
            d="M 50,25 C 65,12 135,12 150,25 L 185,45 C 190,48 190,55 185,58 L 165,72 C 162,74 158,72 158,68 L 158,220 C 158,224 154,228 150,228 L 50,228 C 46,228 42,224 42,220 L 42,68 C 42,72 38,74 35,72 L 15,58 C 10,55 10,48 15,45 Z" 
            fill="url(#meshVentilation)"
            className="pointer-events-none"
          />

          {/* PREMIUM COLLAR STYLE */}
          <path 
            d="M 50,25 C 65,12 135,12 150,25 L 145,30 C 131,18 69,18 55,30 Z" 
            fill={activePreset.collarColor} 
          />

          {/* SLEEVE CUFF TRIMS */}
          <path d="M 15,45 C 10,48 10,55 15,58 L 19,55 C 15,52 15,48 19,45 Z" fill={activePreset.collarColor} />
          <path d="M 185,45 C 190,48 190,55 185,58 L 181,55 C 185,52 185,48 181,45 Z" fill={activePreset.collarColor} />

          {/* DYNAMIC PLAYER CUSTOM NAME (WARPED/ARCHED TEXTPATH) */}
          <text className="font-sans font-black tracking-widest text-[11px] select-none" fill={activePreset.fontColor} textAnchor="middle">
            <textPath href="#backNameCurve" startOffset="50%" textAnchor="middle">
              {formattedName}
            </textPath>
          </text>

          {/* DYNAMIC SQUAD NUMBER (DOUBLE LAYERED EMBROIDERED ATHLETIC OUTLINE) */}
          {/* Layer 1: Strong outer shadow stroke */}
          <text 
            x="100" 
            y="145" 
            dominantBaseline="middle" 
            textAnchor="middle" 
            fill={activePreset.fontColor} 
            stroke={activePreset.accentColor === activePreset.fontColor ? activePreset.jerseyColor : activePreset.accentColor} 
            strokeWidth="7" 
            strokeLinejoin="miter"
            className="font-mono font-black text-[65px] select-none tracking-tight leading-none"
          >
            {formattedNumber}
          </text>
          {/* Layer 2: Core font fill */}
          <text 
            x="100" 
            y="145" 
            dominantBaseline="middle" 
            textAnchor="middle" 
            fill={activePreset.fontColor} 
            className="font-mono font-black text-[65px] select-none tracking-tight leading-none"
          >
            {formattedNumber}
          </text>

          {/* SUB-LOGO PRINT UNDER NUMBER (AUTHENTIC MERCH SPORT) */}
          <text 
            x="100" 
            y="190" 
            dominantBaseline="middle" 
            textAnchor="middle" 
            fill={activePreset.fontColor} 
            fillOpacity="0.4"
            className="font-sans font-extrabold text-[7px] tracking-[0.2em] select-none"
          >
            CLUB DA BOLA
          </text>
        </svg>

        {/* Floating Quick Stats on Sleeve */}
        <div className="absolute bottom-2.5 right-3 text-right bg-black/60 backdrop-blur-md px-2 py-0.5 rounded border border-white/5 pointer-events-none">
          <p className="text-[6.5px] font-mono text-white/45">VER./REV.</p>
          <p className="text-[7.5px] font-black text-amber-500 font-mono tracking-tight">{style.toUpperCase()}</p>
        </div>
      </div>

      {/* Control Deck (Aesthetic customization dials) */}
      <div className="w-full space-y-3">
        {/* Colors selector */}
        <div className="space-y-1">
          <span className="text-[8px] font-black uppercase text-white/40 tracking-wider block">PRESETS DE TECIDO E CORES</span>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetSelect(preset)}
                className={cn(
                  "size-5 rounded-full transition-all flex items-center justify-center relative active:scale-90 hover:scale-110",
                  activePreset.id === preset.id ? "scale-110 ring-2 ring-red-500 ring-offset-2 ring-offset-slate-900" : ""
                )}
                title={preset.name}
              >
                <span className={cn("size-full rounded-full", preset.bgClass)} />
              </button>
            ))}
          </div>
        </div>

        {/* Styles selector (Solid, Striped, Hooped) */}
        <div className="flex items-center justify-between bg-black/40 rounded-xl p-2 border border-white/5">
          <div className="text-left">
            <p className="text-[7px] font-black text-white/30 uppercase tracking-widest leading-none">PADRÃO</p>
            <p className="text-[8.5px] font-extrabold text-white uppercase tracking-wider">{style}</p>
          </div>
          <button
            type="button"
            onClick={handleStyleCycle}
            className="bg-slate-850 hover:bg-red-800 text-white/60 hover:text-white p-1.5 rounded-lg transition-all border border-white/5 flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider active:scale-95"
          >
            <RefreshCw size={10} /> Alternar
          </button>
        </div>
      </div>
    </div>
  );
};
