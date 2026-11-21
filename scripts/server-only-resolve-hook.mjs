export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    const stub = context.data?.stub;
    if (stub) {
      return { shortCircuit: true, url: stub };
    }
  }
  return nextResolve(specifier, context);
}
