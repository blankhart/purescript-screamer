export const editInput = () => {
  const input = document.querySelector('#root input');
  input.value = 'five poets';
  input.focus();
  input.setSelectionRange(1, 4, 'backward');
  return () => document.querySelector('#root input') === input
    && document.activeElement === input
    && input.value === 'five poets'
    && input.selectionStart === 1
    && input.selectionEnd === 4
    && input.selectionDirection === 'backward';
};
