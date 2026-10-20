import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

interface QRScannerProps {
  onScan: (decodedText: string) => void;
}

/** html5-qrcode throws synchronously when stopping a camera that never started (no camera, permission denied,
 *  or an unmount before start resolves). */
function stopSafely(scanner: Html5Qrcode | null): void {
  if (!scanner) return;
  try {
    if (scanner.isScanning) scanner.stop().catch(() => {});
  } catch {
    // not running: nothing to stop
  }
}

/** Plain-Spanish reason when the camera cannot open (H37: iPhone Safari/Chrome). */
export function cameraFailureMessage(error: unknown): string {
  const text = String((error as { name?: string })?.name ?? '') + ' ' + String(error ?? '');
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'Este navegador no permite usar la cámara aquí.';
  }
  if (/NotAllowed|Permission/i.test(text)) {
    return 'No hay permiso para usar la cámara. En el iPhone: Ajustes → Safari (o Chrome) → Cámara → Permitir.';
  }
  if (/NotFound|Overconstrained|no camera/i.test(text)) {
    return 'No se encontró la cámara del equipo.';
  }
  if (/NotReadable|in use/i.test(text)) {
    return 'La cámara está ocupada por otra aplicación. Ciérrala e intenta de nuevo.';
  }
  return 'No se pudo abrir la cámara.';
}

/** Scans a bundle QR with the back camera. If the camera fails, it says why and keeps the manual code field
 *  on screen: it never leaves the scan view. */
export default function QRScanner({ onScan }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setCameraError(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(cameraFailureMessage(null));
      return undefined;
    }
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      scanner
        .start(
          { facingMode: 'environment' }, // back camera
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            stopSafely(scanner);
            onScan(decodedText);
          },
          () => {
            // frame without a QR: keep scanning
          },
        )
        .catch((err) => {
          if (!cancelled) setCameraError(cameraFailureMessage(err));
        });
    } catch (err) {
      setCameraError(cameraFailureMessage(err));
    }
    return () => {
      cancelled = true;
      stopSafely(scannerRef.current);
      scannerRef.current = null;
    };
  }, [attempt]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div id="qr-reader" className="w-full max-w-sm rounded-xl overflow-hidden" />
      {cameraError ? (
        <div className="w-full max-w-sm rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
          <p className="font-semibold">{cameraError}</p>
          <p className="mt-1">Escribe abajo el código impreso en la etiqueta del bulto.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Reintentar cámara
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Apunta la cámara al código QR del bulto</p>
      )}
      {/* Damaged label or no camera: type the short code printed on the label and the bundle number */}
      <div className="w-full max-w-sm flex gap-2">
        <Input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="O escribe el código (muebles: 0ba3b3e6-1; piedra: 0ba3b3e6)"
          className="min-h-12 flex-1"
          autoCapitalize="none"
          autoCorrect="off"
        />
        <Button
          type="button"
          disabled={!manualCode.trim()}
          onClick={() => onScan(manualCode.trim())}
          className="min-h-12"
        >
          Usar código
        </Button>
      </div>
    </div>
  );
}
