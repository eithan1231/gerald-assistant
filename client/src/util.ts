export const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const unixTimestamp = () => Math.floor(Date.now() / 1000);
