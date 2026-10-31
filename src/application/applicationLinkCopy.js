// Presentation only: no navigation policy, destination default, identity or receiver acknowledgement.
export function applicationLinkCopy(destination, locale = 'en') {
  const language = typeof locale === 'string' && /^es(?:-|$)/i.test(locale) ? 'es' : 'en';
  let lendingPad = false, webLink = false;
  try {
    const url = new URL(destination);
    webLink = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    // Recognize only LendingPad's exact HTTPS host and observed consumer-route form.
    // This identifies the provider for wording, NOT the company, LO or future route availability.
    lendingPad = webLink && url.protocol === 'https:' && url.hostname === 'prod.lendingpad.com' && !url.port
      && !url.search && ['', '#/'].includes(url.hash)
      && /^\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/pos\/?$/i.test(url.pathname);
  } catch { /* Unknown configuration retains generic wording; handler behavior is unchanged. */ }
  const localCopy = language === 'es'
    ? 'Al continuar, se guarda temporalmente en esta pestaña una copia de tus datos y de la cotización seleccionada.'
    : 'Continuing saves a temporary copy of your entries and selected quote in this browser tab.';
  const opening = language === 'es'
    ? lendingPad ? 'Se abre LendingPad en esta pestaña para registrarte, iniciar sesión o continuar.' : webLink ? 'Se abre el enlace de solicitud configurado en esta pestaña.' : ''
    : lendingPad ? 'Opens LendingPad in this tab to sign up, sign in or continue.' : webLink ? 'Opens the configured application link in this tab.' : '';
  const receipt = webLink ? language === 'es'
    ? 'Abrir la página no confirma que el portal haya recibido esos datos.'
    : 'Opening the page does not confirm that the portal received those details.' : '';
  return { language, provider: lendingPad ? 'lendingpad' : 'generic', label: language === 'es'
    ? lendingPad ? 'Abrir LendingPad' : 'Continuar a la solicitud'
    : lendingPad ? 'Open LendingPad' : 'Continue to Application', notice: [opening, localCopy, receipt].filter(Boolean).join(' ') };
}
