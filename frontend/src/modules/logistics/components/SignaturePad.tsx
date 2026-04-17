import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export default function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const sigRef = useRef<SignatureCanvas>(null);

  const handleSave = () => {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      alert('Por favor recaba la firma antes de guardar.');
      return;
    }
    const dataUrl = sigRef.current.getTrimmedCanvas().toDataURL('image/png');
    onSave(dataUrl);
  };

  const handleClear = () => {
    sigRef.current?.clear();
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-gray-700">
        Firma del cliente con el dedo:
      </p>
      <div className="border-2 border-gray-300 rounded-xl overflow-hidden bg-white">
        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          minWidth={2}
          maxWidth={3}
          canvasProps={{
            className: 'w-full',
            style: { height: '220px', touchAction: 'none' },
          }}
        />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleClear}
          className="flex-1 py-3 rounded-xl border border-gray-300 
                     text-gray-700 font-medium text-base active:bg-gray-100"
        >
          Borrar y repetir
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="flex-1 py-3 rounded-xl bg-green-600 
                     text-white font-semibold text-base active:bg-green-700"
        >
          Guardar firma
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="py-2 text-sm text-gray-400 underline text-center"
      >
        Cancelar
      </button>
    </div>
  );
}
