export const sameNodes = (xs) => (ys) => xs.length === ys.length && xs.every((x, i) => x === ys[i]);

export const throwIt = (m) => () => {
  throw new Error(m);
};
