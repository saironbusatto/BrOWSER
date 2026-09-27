import { useState } from 'react';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window { __telefoneReact?: string }
}

// Controlado: só muda via onChange do React. Setar `input.value` direto sem
// disparar o evento que o React escuta deixa o estado vazio, e é isso que o teste pega.
function Telefone() {
  const [valor, setValor] = useState('');
  window.__telefoneReact = valor;
  return (
    <label>
      Telefone celular
      <input type="tel" name="telefone" value={valor} onChange={(e) => setValor(e.target.value)} />
    </label>
  );
}

createRoot(document.getElementById('telefone-root')!).render(<Telefone />);
