export const exit = (code) => () => {
  process.exitCode = code;
};
