import React, { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Download, Moon, Sun, Globe, Image as ImageIcon, Settings as SettingsIcon, AlignLeft, AlignRight, EyeOff, Aperture, GripVertical, Plus } from 'lucide-react';
import { extractExifData, getBrandLogoKey } from './utils/exif';
import { generateWatermark } from './utils/canvas';
import { BannerStyle, ExifData, Language, ThemeMode, WatermarkSettings, WatermarkElement, Side, Line } from './types';
import { TRANSLATIONS, LOGOS } from './constants';

function App() {
  const [theme, setTheme] = useState<ThemeMode>(ThemeMode.SYSTEM);
  const [lang, setLang] = useState<Language>(Language.ZH);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [exif, setExif] = useState<ExifData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoLogoKey, setAutoLogoKey] = useState<string>('DEFAULT');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragHandleHovered, setDragHandleHovered] = useState<string | null>(null);

  const [settings, setSettings] = useState<WatermarkSettings>({
    elements: {
      model: { id: 'model', label: 'model', text: '', side: 'left', line: 1, order: 0 },
      lens: { id: 'lens', label: 'lens', text: '', side: 'left', line: 1, order: 1 },
      focalLength: { id: 'focalLength', label: 'focalLength', text: '', side: 'right', line: 1, order: 0 },
      fNumber: { id: 'fNumber', label: 'fNumber', text: '', side: 'right', line: 1, order: 1 },
      iso: { id: 'iso', label: 'iso', text: '', side: 'right', line: 1, order: 2 },
      exposureTime: { id: 'exposureTime', label: 'exposureTime', text: '', side: 'right', line: 1, order: 3 },
      date: { id: 'date', label: 'date', text: '', side: 'right', line: 2, order: 0 },
      gps: { id: 'gps', label: 'gps', text: '', side: 'off', line: 2, order: 1 },
    },
    bannerStyle: BannerStyle.WHITE,
    blurIntensity: 30, 
    useOriginalDate: true,
    selectedLogoKey: 'AUTO',
    customLogoSvg: null,
    logoPosition: 'left',
    useAdaptiveTextColor: false,
  });

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === ThemeMode.DARK || (theme === ThemeMode.SYSTEM && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    setFile(f);
    
    try {
      const data = await extractExifData(f);
      setExif(data);
      
      const detectedKey = getBrandLogoKey(data.make);
      setAutoLogoKey(detectedKey);

      setSettings(prev => {
        const next = { ...prev };
        const els = next.elements;
        els.model.text = data.model;
        els.lens.text = data.lens;
        els.focalLength.text = data.focalLength;
        els.fNumber.text = data.fNumber;
        els.iso.text = data.iso ? `ISO${data.iso}` : '';
        els.exposureTime.text = data.exposureTime;
        els.date.text = data.dateTime;
        els.gps.text = data.gps || '';
        return next;
      });

    } catch (e) {
      console.error("Exif failed", e);
      setExif({
        make: 'Camera',
        model: 'Unknown',
        lens: '',
        focalLength: '',
        fNumber: '',
        iso: '',
        exposureTime: '',
        dateTime: new Date().toLocaleString(),
      });
      setAutoLogoKey('DEFAULT');
    }
  }, []);

  useEffect(() => {
      const timer = setTimeout(() => {
          if (!exif || !exif.lat || !exif.lon) return;
          
          const fetchAddress = async () => {
              try {
                 const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${exif.lat}&lon=${exif.lon}&zoom=10&accept-language=${lang}`);
                 if (!res.ok) throw new Error('Network response was not ok');
                 
                 const json = await res.json();
                 if (json && json.address) {
                     const city = json.address.city || json.address.town || json.address.village || json.address.county || '';
                     const country = json.address.country || '';
                     
                     let locParts = [];
                     if (city) locParts.push(city);
                     if (country && country !== city) locParts.push(country);
                     
                     const loc = locParts.join(', ');

                     if (loc) {
                         setSettings(prev => ({
                             ...prev,
                             elements: { ...prev.elements, gps: { ...prev.elements.gps, text: loc } }
                         }));
                     }
                 }
              } catch (err) {
                  console.warn("GPS Address fetch failed", err);
              }
          };
          fetchAddress();
      }, 500);
      return () => clearTimeout(timer);
  }, [exif, lang]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false
  });

  const onLogoDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target?.result as string;
        setSettings(prev => ({ ...prev, customLogoSvg: content, selectedLogoKey: 'CUSTOM' }));
    };
    reader.readAsText(f);
  }, []);

  const { getRootProps: getLogoRoot, getInputProps: getLogoInput } = useDropzone({
      onDrop: onLogoDrop,
      accept: { 'image/svg+xml': [] },
      multiple: false,
      noClick: true
  });

  useEffect(() => {
    if (!file || !exif) return;
    
    const finalLogoKey = settings.selectedLogoKey === 'AUTO' ? autoLogoKey : settings.selectedLogoKey;

    const timer = setTimeout(async () => {
      setIsProcessing(true);
      try {
        const url = await generateWatermark(file, exif, settings, finalLogoKey);
        setPreviewUrl(url);
      } catch (e) {
        console.error("Watermark generation error:", e);
      } finally {
        setIsProcessing(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [file, exif, settings, autoLogoKey]);

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement('a');
    link.href = previewUrl;
    link.download = `watermarked_${file?.name || 'image.jpg'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const updateElementText = (key: string, val: string) => {
    setSettings(prev => ({
      ...prev,
      elements: {
        ...prev.elements,
        [key]: { ...prev.elements[key as keyof typeof prev.elements], text: val }
      }
    }));
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
      setDraggedId(id);
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSide: Side, targetLine: Line, targetId?: string) => {
      e.preventDefault();
      if (!draggedId) return;
      if (draggedId === targetId) return;

      setSettings(prev => {
          const els = { ...prev.elements };
          const draggedEl = els[draggedId as keyof typeof els];
          
          const groupItems = Object.entries(els)
              .filter(([k, el]) => el.side === targetSide && el.line === targetLine && k !== draggedId)
              .sort((a, b) => a[1].order - b[1].order);

          let insertIndex = groupItems.length;
          if (targetId) {
              const idx = groupItems.findIndex(([k]) => k === targetId);
              if (idx !== -1) insertIndex = idx; 
          }

          const newGroup = [...groupItems];
          newGroup.splice(insertIndex, 0, [draggedId, draggedEl]);

          newGroup.forEach(([k], index) => {
              els[k as keyof typeof els] = {
                  ...els[k as keyof typeof els],
                  side: targetSide,
                  line: targetLine,
                  order: index
              };
          });

          els[draggedId as keyof typeof els].side = targetSide;
          els[draggedId as keyof typeof els].line = targetLine;

          return { ...prev, elements: els };
      });
      setDraggedId(null);
  };
  
  const handleHide = (id: string) => {
      setSettings(prev => ({
          ...prev,
          elements: {
              ...prev.elements,
              [id]: { ...prev.elements[id as keyof typeof prev.elements], side: 'off' }
          }
      }));
  };

  const handleRestore = (id: string) => {
      setSettings(prev => ({
          ...prev,
          elements: {
              ...prev.elements,
              [id]: { ...prev.elements[id as keyof typeof prev.elements], side: 'left', line: 1 }
          }
      }));
  };

  const renderDropZone = (side: 'left' | 'right', line: 1 | 2, label: string) => {
      const items = Object.entries(settings.elements)
          .filter(([_, el]) => el.side === side && el.line === line)
          .sort((a, b) => a[1].order - b[1].order);
      
      return (
          <div 
            className={`flex flex-col gap-2 p-2 rounded-xl transition-colors min-h-[120px] w-full
                ${isDragActive ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300' : 'bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700'}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, side, line)}
          >
               <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-1">{label}</div>
               
               {items.map(([key, el]) => (
                   <div 
                       key={key} 
                       draggable={dragHandleHovered === key}
                       onDragStart={(e) => handleDragStart(e, key)}
                       onDrop={(e) => {
                           e.stopPropagation();
                           handleDrop(e, side, line, key);
                       }}
                       className={`
                           group flex items-center gap-3 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm
                           hover:border-blue-400 hover:shadow-md transition-all
                           ${draggedId === key ? 'opacity-40' : 'opacity-100'}
                       `}
                   >
                       <div 
                           className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 -m-1"
                           onMouseEnter={() => setDragHandleHovered(key)}
                           onMouseLeave={() => setDragHandleHovered(null)}
                           onTouchStart={() => setDragHandleHovered(key)} // Touch support hint
                       >
                           <GripVertical size={20} />
                       </div>
                       
                       <div className="flex-1 min-w-0 flex flex-col gap-1 overflow-hidden">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide truncate">{t[el.label as keyof typeof t] || el.label}</span>
                           <input 
                               type="text" 
                               value={el.text}
                               onChange={(e) => updateElementText(key, e.target.value)}
                               onKeyDown={(e) => e.stopPropagation()}
                               onMouseDown={(e) => e.stopPropagation()}
                               className="w-full bg-transparent border-none p-0 text-base font-medium text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:ring-0 truncate"
                               placeholder="..."
                           />
                       </div>

                       <button 
                           onClick={() => handleHide(key)}
                           className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
                           title={t.off}
                       >
                           <EyeOff size={16} />
                       </button>
                   </div>
               ))}
               
               {items.length === 0 && (
                   <div className="flex-1 flex items-center justify-center text-gray-300 text-xs italic border-2 border-transparent border-dashed rounded-lg">
                       {t.drop} Here
                   </div>
               )}
          </div>
      );
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-black dark:bg-white text-white dark:text-black p-1 rounded">
            <ImageIcon size={20} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">LensMark</h1>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
             <select 
               value={lang}
               onChange={(e) => setLang(e.target.value as Language)}
               className="appearance-none bg-transparent pl-8 pr-4 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer outline-none font-medium text-sm"
             >
               {Object.values(Language).map(l => (
                   <option key={l} value={l}>{l.toUpperCase()}</option>
               ))}
             </select>
             <Globe size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
          </div>

          <button 
            onClick={() => setTheme(t => t === ThemeMode.LIGHT ? ThemeMode.DARK : ThemeMode.LIGHT)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
          >
            {theme === ThemeMode.DARK ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 lg:p-8 flex flex-col lg:flex-row gap-8">
        
        <div className="flex-1 flex flex-col min-h-[50vh]">
          {!file ? (
            <div 
              {...getRootProps()} 
              className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-12 transition-colors cursor-pointer
                ${isDragActive ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'}`}
            >
              <input {...getInputProps()} />
              <Upload size={48} className="text-gray-400 mb-4" />
              <p className="text-xl font-medium text-gray-600 dark:text-gray-400 text-center">{t.drop}</p>
              <button className="mt-4 px-6 py-2 bg-black dark:bg-white text-white dark:text-black rounded-full font-medium hover:opacity-90 transition-opacity">
                {t.upload}
              </button>
            </div>
          ) : (
            <div className="relative flex-1 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-hidden flex items-center justify-center shadow-inner min-h-[400px]">
              {isProcessing && (
                <div className="absolute inset-0 bg-black/20 backdrop-blur-sm z-10 flex items-center justify-center">
                  <div className="bg-white dark:bg-gray-900 px-6 py-3 rounded-full shadow-xl flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin text-blue-500" />
                    <span className="font-medium">{t.processing}</span>
                  </div>
                </div>
              )}
              {previewUrl ? (
                <img 
                  src={previewUrl} 
                  alt="Preview" 
                  className="max-w-full max-h-[80vh] object-contain shadow-2xl"
                />
              ) : (
                <div className="text-gray-400">Rendering...</div>
              )}
              
              <button 
                onClick={() => { setFile(null); setPreviewUrl(null); }}
                className="absolute top-4 right-4 bg-white/90 dark:bg-black/90 p-2 rounded-full shadow-lg hover:scale-105 transition-transform z-20"
              >
                <span className="sr-only">Close</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}
        </div>

        <div className={`w-full lg:w-[520px] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 flex flex-col ${!file ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
            <SettingsIcon size={20} className="text-gray-500" />
            <h2 className="text-lg font-bold">{t.settings}</h2>
          </div>

          <div className="p-6 flex-1 overflow-y-auto space-y-8 max-h-[70vh]">
            
            {/* Logo Settings */}
            <div className="space-y-3">
                 <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t.logo}</label>
                 <div className="space-y-3">
                     <select 
                        value={settings.selectedLogoKey}
                        onChange={(e) => setSettings(p => ({ ...p, selectedLogoKey: e.target.value }))}
                        className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none"
                     >
                         <option value="AUTO">{t.auto} ({autoLogoKey})</option>
                         <option value="CUSTOM">{t.customLogo}</option>
                         {Object.values(LOGOS).map(l => (
                             <option key={l.id} value={l.id.toUpperCase()}>{l.label}</option>
                         ))}
                     </select>
                     
                     <div className="flex gap-2 text-sm bg-gray-50 dark:bg-gray-800 p-1 rounded-lg">
                        <button
                          onClick={() => setSettings(p => ({ ...p, logoPosition: 'left' }))}
                          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-colors ${settings.logoPosition === 'left' ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500'}`}
                        >
                           <AlignLeft size={14} /> {t.logoLeft}
                        </button>
                        <button
                          onClick={() => setSettings(p => ({ ...p, logoPosition: 'right' }))}
                          className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-2 transition-colors ${settings.logoPosition === 'right' ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500'}`}
                        >
                           <AlignRight size={14} /> {t.logoRight}
                        </button>
                     </div>

                     {settings.selectedLogoKey === 'CUSTOM' && (
                         <div 
                            {...getLogoRoot()}
                            className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                         >
                             <input {...getLogoInput()} />
                             <Aperture className="mx-auto mb-2 text-gray-400" size={24} />
                             <p className="text-xs text-gray-500">{t.uploadLogo}</p>
                         </div>
                     )}
                 </div>
            </div>

            {/* Style Selector */}
            <div className="space-y-3">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t.style}</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: BannerStyle.WHITE, label: t.white, bg: 'bg-white', text: 'text-black', border: 'border-gray-200' },
                  { id: BannerStyle.BLACK, label: t.black, bg: 'bg-black', text: 'text-white', border: 'border-black' },
                  { id: BannerStyle.BLUR, label: t.blur, bg: 'bg-gradient-to-br from-gray-200 to-gray-400', text: 'text-gray-800', border: 'border-transparent' }, 
                  { id: BannerStyle.ADAPTIVE, label: t.adaptive, bg: 'bg-gradient-to-r from-blue-100 to-purple-100', text: 'text-gray-800', border: 'border-transparent' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSettings(prev => ({ ...prev, bannerStyle: s.id }))}
                    className={`
                      relative p-3 rounded-xl border-2 transition-all flex items-center justify-center font-medium
                      ${settings.bannerStyle === s.id ? 'border-blue-500 ring-2 ring-blue-500/20' : `${s.border} hover:bg-gray-50 dark:hover:bg-gray-800`}
                      ${s.bg} ${s.text}
                    `}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              
              {settings.bannerStyle === BannerStyle.BLUR && (
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{t.blurIntensity}</span>
                    <span>{settings.blurIntensity}px</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={settings.blurIntensity}
                    onChange={(e) => setSettings(p => ({...p, blurIntensity: parseInt(e.target.value)}))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                  />
                </div>
              )}
               {settings.bannerStyle === BannerStyle.ADAPTIVE && (
                   <div className="flex items-center gap-2 mt-2">
                       <button
                         onClick={() => setSettings(p => ({...p, useAdaptiveTextColor: !p.useAdaptiveTextColor}))}
                         className={`w-4 h-4 rounded border flex items-center justify-center ${settings.useAdaptiveTextColor ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}
                       >
                           {settings.useAdaptiveTextColor && <div className="w-2 h-2 bg-white rounded-sm" />}
                       </button>
                       <span className="text-xs text-gray-500">Use Adaptive Text Color</span>
                   </div>
               )}
            </div>

            {/* Layout & Content Editor */}
            <div className="space-y-4">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{t.contentLayout}</label>
              
              <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-3 flex flex-col sm:flex-row gap-3">
                  {/* Left Column */}
                  <div className="flex-1 flex flex-col gap-3 min-w-[140px]">
                      {renderDropZone('left', 1, t.left + ' - ' + t.line1)}
                      {renderDropZone('left', 2, t.left + ' - ' + t.line2)}
                  </div>
                  
                  {/* Visual Divider - Hidden on mobile */}
                  <div className="hidden sm:block w-px bg-gray-300 dark:bg-gray-700 my-2 self-stretch"></div>
                  
                  {/* Right Column */}
                  <div className="flex-1 flex flex-col gap-3 min-w-[140px]">
                      {renderDropZone('right', 1, t.right + ' - ' + t.line1)}
                      {renderDropZone('right', 2, t.right + ' - ' + t.line2)}
                  </div>
              </div>

              {/* Hidden Items Bin */}
              {Object.values(settings.elements).some(e => e.side === 'off') && (
                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border-2 border-dashed border-gray-200 dark:border-gray-700">
                     <h3 className="text-xs font-bold text-gray-400 mb-2 uppercase flex items-center gap-2">
                        <EyeOff size={14} /> {t.off}
                     </h3>
                     <div className="flex flex-wrap gap-2">
                          {Object.entries(settings.elements).filter(e => e[1].side === 'off').map(([key, el]) => (
                              <button
                                 key={key}
                                 onClick={() => handleRestore(key)}
                                 className="group flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-500 transition-all shadow-sm"
                              >
                                  <Plus size={12} className="opacity-50 group-hover:opacity-100" />
                                  <span>{t[el.label as keyof typeof t] || el.label}</span>
                              </button>
                          ))}
                     </div>
                  </div>
              )}
            </div>

          </div>

          <div className="p-6 border-t border-gray-100 dark:border-gray-800">
            <button 
              onClick={handleDownload}
              disabled={!previewUrl || isProcessing}
              className="w-full py-4 bg-black dark:bg-white text-white dark:text-black rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={24} />
              {t.download}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;