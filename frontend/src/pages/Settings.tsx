import { useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useToastStore } from '../store/toastStore';

const PRESET_WIDTHS = [58, 72, 80];

export default function Settings() {
  const { receiptPaperWidth, setReceiptPaperWidth } = useSettingsStore();
  const toast = useToastStore();
  const [customInput, setCustomInput] = useState(
    PRESET_WIDTHS.includes(receiptPaperWidth) ? '' : String(receiptPaperWidth)
  );
  const isCustom = !PRESET_WIDTHS.includes(receiptPaperWidth);

  const applyWidth = (w: number) => {
    if (!w || w < 40 || w > 300) {
      toast.error('Paper width must be between 40mm and 300mm');
      return;
    }
    setReceiptPaperWidth(w);
    toast.success(`Receipt paper width set to ${w}mm`);
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-surface-900 mb-1">Settings</h1>
      <p className="text-sm text-surface-500 mb-6">Configure POS preferences</p>

      <div className="card p-6 space-y-6">
        {/* Receipt Printer */}
        <div>
          <h2 className="text-base font-semibold text-surface-800 mb-1 flex items-center gap-2">
            <svg className="w-4 h-4 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Receipt Printer
          </h2>
          <p className="text-xs text-surface-400 mb-4">
            Select the paper width that matches your thermal receipt printer.
            Current: <span className="font-semibold text-primary-600">{receiptPaperWidth}mm</span>
          </p>

          {/* Preset buttons */}
          <div className="flex flex-wrap gap-3 mb-4">
            {PRESET_WIDTHS.map((w) => (
              <button
                key={w}
                onClick={() => { setCustomInput(''); applyWidth(w); }}
                className={`px-5 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                  receiptPaperWidth === w && !isCustom
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-surface-200 bg-white text-surface-700 hover:border-primary-300'
                }`}
              >
                {w}mm
                {w === 80 && <span className="ml-1 text-xs font-normal text-surface-400">(standard)</span>}
              </button>
            ))}
          </div>

          {/* Custom width */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="number"
                min={40}
                max={300}
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Custom"
                className={`input w-32 pr-10 ${isCustom ? 'border-primary-500 ring-1 ring-primary-300' : ''}`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-surface-400 pointer-events-none">mm</span>
            </div>
            <button
              onClick={() => {
                const w = parseInt(customInput);
                if (!customInput || isNaN(w)) { toast.error('Enter a valid width'); return; }
                applyWidth(w);
              }}
              className="btn-primary px-4 py-2 text-sm"
            >
              Apply
            </button>
            {isCustom && (
              <span className="text-xs text-primary-600 font-medium">Custom width active</span>
            )}
          </div>
          <p className="text-xs text-surface-400 mt-2">Accepted range: 40mm – 300mm</p>
        </div>
      </div>
    </div>
  );
}
