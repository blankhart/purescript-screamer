
export const property = (a: any) => (b: any) => {
  return b[a];
};

export const eventEffect = (a: any) => (b: any) => () => {
  return b[a]();
};

export const eventCast = (name: string) => (event: Event) => {
  return event.type == name ? event : null;
};
