export const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const unixTimestamp = () => Math.round(Date.now() / 1000);
