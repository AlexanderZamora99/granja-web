// Armador de panal mixto de 30 huevos: opciones sugeridas según la
// disponibilidad (con su precio) y ajuste manual por tipo.
// Usa window.Tienda (app.js).

(() => {
  const T = () => window.Tienda;
  const $ = (sel) => document.querySelector(sel);
  let composicion = {};
  let opcionElegida = null;

  const total = () => Object.values(composicion).reduce((s, n) => s + n, 0);

  function pintarOpciones() {
    const t = T();
    const cont = $("#mixto-opciones");
    cont.replaceChildren();
    const opciones = t.opcionesMixto();
    if (!opciones.length) {
      const p = document.createElement("p");
      p.className = "nota";
      p.textContent = "Hoy no hay huevos suficientes para armar un panal de 30. Escríbenos y te avisamos.";
      cont.append(p);
      return;
    }
    opciones.forEach((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mixto-opcion";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(opcionElegida === o.nombre));
      const nombre = document.createElement("strong");
      nombre.textContent = o.nombre;
      const precio = document.createElement("span");
      precio.className = "mixto-opcion-precio";
      precio.textContent = t.cop(o.precio);
      const detalle = document.createElement("span");
      detalle.className = "mixto-opcion-detalle";
      detalle.textContent = t.textoComposicion(o.composicion);
      b.append(nombre, precio, detalle);
      b.addEventListener("click", () => {
        composicion = { ...o.composicion };
        opcionElegida = o.nombre;
        pintar();
      });
      cont.append(b);
    });
  }

  function pintarTipos() {
    const t = T();
    const cont = $("#mixto-tipos");
    cont.replaceChildren();
    t.estado.tipos.forEach((info) => {
      const maximo = Math.max(0, t.libre(info.tipo));
      if (t.precioHuevoMixto(info.tipo) === undefined) return;
      const n = composicion[info.tipo] || 0;

      const fila = document.createElement("div");
      fila.className = "mixto-fila" + (maximo === 0 && !n ? " mixto-fila-agotada" : "");
      const nombre = document.createElement("div");
      const titulo = document.createElement("strong");
      titulo.textContent = info.tipo;
      const detalle = document.createElement("span");
      detalle.className = "item-detalle";
      detalle.textContent = maximo === 0 && !n ? "Agotado" : `${info.peso} · ${t.cop(t.precioHuevoMixto(info.tipo))} c/u`;
      nombre.append(titulo, document.createElement("br"), detalle);

      const contador = document.createElement("div");
      contador.className = "contador";
      const menos = document.createElement("button");
      menos.type = "button";
      menos.className = "boton-icono";
      menos.textContent = "−";
      menos.setAttribute("aria-label", `Quitar un ${info.tipo}`);
      menos.disabled = n === 0;
      const valor = document.createElement("output");
      valor.className = "mixto-valor";
      valor.textContent = n;
      const mas = document.createElement("button");
      mas.type = "button";
      mas.className = "boton-icono";
      mas.textContent = "+";
      mas.setAttribute("aria-label", `Agregar un ${info.tipo}`);
      mas.disabled = n >= maximo || total() >= t.HUEVOS_POR_PANAL;

      const cambiar = (delta) => {
        composicion[info.tipo] = Math.max(0, n + delta);
        opcionElegida = null;
        pintar();
      };
      menos.addEventListener("click", () => cambiar(-1));
      mas.addEventListener("click", () => cambiar(1));
      contador.append(menos, valor, mas);
      fila.append(nombre, contador);
      cont.append(fila);
    });
  }

  function pintarPie() {
    const t = T();
    const n = total();
    const falta = t.HUEVOS_POR_PANAL - n;
    $("#mixto-conteo").textContent = falta === 0
      ? `${n} de ${t.HUEVOS_POR_PANAL} huevos ✓`
      : `${n} de ${t.HUEVOS_POR_PANAL} huevos · faltan ${falta}`;
    $("#mixto-precio").textContent = n ? t.cop(t.precioMixto(composicion)) : "";
    $("#mixto-agregar").disabled = falta !== 0;
  }

  function pintar() {
    pintarOpciones();
    pintarTipos();
    pintarPie();
  }

  function montar() {
    $("#mixto-agregar").addEventListener("click", () => {
      const r = T().agregarMixto(composicion);
      $("#mixto-aviso").textContent = r.mensaje;
      if (r.ok) {
        composicion = {};
        opcionElegida = null;
        pintar();
      }
    });
    pintar();
    // El pedido cambia la disponibilidad restante: se recalculan opciones y límites.
    document.addEventListener("tienda:pedido", () => {
      // Recorta la selección si ya no cabe en lo disponible.
      for (const [tipo, n] of Object.entries(composicion)) {
        composicion[tipo] = Math.min(n, Math.max(0, T().libre(tipo)));
      }
      pintar();
    });
  }

  document.addEventListener("tienda:lista", montar, { once: true });
})();
