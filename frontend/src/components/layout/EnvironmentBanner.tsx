/** Red strip on every screen of the "Valentina Pruebas" environment (Render static site built with
 *  VITE_APP_ENV=pruebas). Production builds have no VITE_APP_ENV and show nothing. */
export const IS_TEST_ENVIRONMENT = import.meta.env.VITE_APP_ENV === 'pruebas';

export default function EnvironmentBanner() {
  if (!IS_TEST_ENVIRONMENT) return null;
  return (
    <div
      role="status"
      className="shrink-0 bg-red-600 px-3 py-1 text-center text-[11px] font-black uppercase tracking-widest text-white"
    >
      Ambiente de pruebas — los datos no son reales y nada de aquí cuenta
    </div>
  );
}
