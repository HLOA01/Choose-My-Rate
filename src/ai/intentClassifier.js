export function normalizeText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyIntent(message = '') {
  const text = normalizeText(message);

  if (!text) {
    return { type: 'empty' };
  }

  if (
    text.includes('start over') ||
    text.includes('reset') ||
    text.includes('new scenario') ||
    text.includes('start new')
  ) {
    return { type: 'reset' };
  }

  if (
    text === 'yes' ||
    text === 'y' ||
    text === 'si' ||
    text === 'sí' ||
    text.includes('that looks right') ||
    text.includes('sounds good') ||
    text.includes('correct')
  ) {
    return { type: 'confirm_yes' };
  }

  if (
    text === 'no' ||
    text === 'n' ||
    text.includes('not right') ||
    text.includes('that is wrong')
  ) {
    return { type: 'confirm_no' };
  }

  if (
    text.startsWith('change ') ||
    text.startsWith('update ') ||
    text.startsWith('set ') ||
    text.startsWith('switch ') ||
    text.startsWith('actually ')
  ) {
    return { type: 'change_value' };
  }

  return { type: 'provide_info' };
}