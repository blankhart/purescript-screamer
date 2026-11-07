// The `value` of an event's target, or "" if it has none.
export const targetValue = (event) => () => {
  const target = event.target;
  return target != null && typeof target.value === "string" ? target.value : "";
};
