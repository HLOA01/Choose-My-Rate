export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isLocalImport = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);

    if (isLocalImport && !hasExtension) {
      return nextResolve(`${specifier}.js`, context);
    }

    throw error;
  }
}
