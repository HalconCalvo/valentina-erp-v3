import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Input } from '@/components/ui/Input';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
  onError?: (error: string) => void;
}

/** html5-qrcode throws synchronously when stopping a camera that never started (no camera, permission denied,
 *  or an unmount before start resolves). */
function stopSafely(scanner: Html5Qrcode): void {
  try {
    if (scanner.isScanning) scanner.stop().catch(() => {});
  } catch {
    // not running: nothing to stop
  }
}

export default function QRScanner({ onScan, onError }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' }, // Cámara trasera del iPad
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          stopSafely(scanner);
        },
        (errorMessage) => {
          onError?.(errorMessage);
        }
      )
      .catch((err) => {
        onError?.(String(err));
      });

    return () => stopSafely(scanner);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div id="qr-reader" className="w-full max-w-sm rounded-xl overflow-hidden" />
      <p className="text-sm text-gray-500">
        Apunta la cámara al código QR del bulto
      </p>
      {/* Damaged label or no camera: type the short code printed on the label and the bundle number */}
      <div className="w-full max-w-sm flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="O escribe el código (muebles: 0ba3b3e6-1; piedra: 0ba3b3e6)"
          className="min-h-12 flex-1"
        />
        <button
          type="button"
          disabled={!manualCode.trim()}
          onClick={() => onScan(manualCode.trim())}
          className="min-h-12 px-4 rounded-xl bg-slate-800 text-white text-sm font-semibold disabled:opacity-40"
        >
          Usar código
        </button>
      </div>
    </div>
  );
}
