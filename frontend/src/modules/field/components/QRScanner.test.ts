import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraFailureMessage } from './QRScanner';

describe('cameraFailureMessage (H37)', () => {
  afterEach(() => vi.unstubAllGlobals());

  const secureCamera = () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => Promise.resolve() } });
  };

  it('explains a denied permission with the iPhone setting', () => {
    secureCamera();
    expect(cameraFailureMessage({ name: 'NotAllowedError' })).toContain('Ajustes');
  });

  it('says when the camera is busy or missing', () => {
    secureCamera();
    expect(cameraFailureMessage({ name: 'NotReadableError' })).toContain('ocupada');
    expect(cameraFailureMessage({ name: 'NotFoundError' })).toContain('No se encontró');
  });

  it('says the browser cannot use the camera without a secure context', () => {
    vi.stubGlobal('isSecureContext', false);
    expect(cameraFailureMessage(null)).toContain('no permite');
  });
});
