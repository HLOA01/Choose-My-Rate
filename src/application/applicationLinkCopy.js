import { isLendingPadConsumerUrl } from './applicationDestination.js';

// Presentation only: receives a destination validated by the active funnel, or no destination.
export function applicationLinkCopy(destination, locale = 'en', { blocked = false } = {}) {
  const language = typeof locale === 'string' && /^es(?:-|$)/i.test(locale) ? 'es' : 'en';
  let lendingPad = false, webLink = false;
  try {
    const url = new URL(destination);
    webLink = ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    // Recognize only LendingPad's exact HTTPS host and observed consumer-route form.
    // This identifies the provider for wording, NOT the company, LO or future route availability.
    lendingPad = webLink && isLendingPadConsumerUrl(url);
  } catch { /* Absent or unknown configuration retains generic wording. */ }
  if (blocked) return {
    language, provider: 'generic',
    label: language === 'es' ? 'Continuar a la solicitud' : 'Continue to Application',
    notice: language === 'es'
      ? 'La solicitud en línea no está disponible. Todavía puedes revisar tu cotización.'
      : 'Online applications are unavailable. You can still review your selected quote.',
    blockedMessage: language === 'es'
      ? 'El enlace de solicitud no está disponible. Tu tasa seleccionada sigue aquí. Comunícate con Home Lenders of America para recibir ayuda.'
      : 'The application link is unavailable. Your selected rate stays here. Contact Home Lenders of America for help.',
  };
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
