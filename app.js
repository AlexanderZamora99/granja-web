// Página de clientes: catálogo, armador de pedido y envío por WhatsApp.
// Datos: sitio.json (negocio, editable a mano) y precios.json (publicado
// desde la app interna, página Precios > Publicar en la web).

const ETIQUETAS = {
  30: "Cubeta (30 u.)",
  20: "Paquete de 20 u.",
  15: "Cartón de 15 u.",
  12: "Cartón de 12 u.",
  10: "Paquete de 10 u.",
  6: "Media docena (6 u.)",
  1: "Unidad suelta",
};
const CLAVE_PEDIDO = "pedido-v1";

const $ = (sel) => document.querySelector(sel);
const cop = (n) => "$ " + Math.round(n).toLocaleString("es-CO");
const etiqueta = (p) => ETIQUETAS[p] || `${p} u.`;

const estado = {
  sitio: null,
  tipos: [],            // [{tipo, peso, precios: {"30": 15000, ...}}]
  presentacion: "30",   // presentación elegida en el catálogo
  pedido: [],           // [{tipo, presentacion, cantidad}]
};

// ---------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------
async function cargarJSON(ruta) {
  const r = await fetch(ruta, { cache: "no-store" });
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json();
}

function numeroWhatsApp(valor) {
  const digitos = String(valor || "").replace(/\D/g, "");
  if (!digitos) return "";
  return digitos.length === 10 ? "57" + digitos : digitos; // celular colombiano sin indicativo
}

function precio(tipo, presentacion) {
  const t = estado.tipos.find((x) => x.tipo === tipo);
  return t ? t.precios[presentacion] : undefined;
}

// ---------------------------------------------------------------
// Datos del negocio
// ---------------------------------------------------------------
function pintarSitio() {
  const s = estado.sitio;
  const valores = {
    ...s,
    domicilio_valor: cop(s.domicilio?.valor || 0),
    domicilio_nota: s.domicilio?.nota || "",
  };
  document.querySelectorAll("[data-campo]").forEach((el) => {
    const v = valores[el.dataset.campo];
    if (v) el.textContent = v;
  });
  document.title = `${s.nombre} · Huevos frescos`;
  $("#anio").textContent = new Date().getFullYear();

  if (!s.direccion) $("#fila-direccion").hidden = true;
  if (s.mapa_url) $("#enlace-mapa").href = s.mapa_url;
  else $("#enlace-mapa").hidden = true;

  const wa = numeroWhatsApp(s.whatsapp);
  if (wa) {
    $("#enlace-whatsapp").href = `https://wa.me/${wa}`;
    $("#enlace-whatsapp").textContent = "+" + wa;
  } else {
    $("#fila-whatsapp").hidden = true;
  }

  if (!s.permite_recoger) $("#opcion-recoger").hidden = true;
}

// ---------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------
function presentacionesDisponibles() {
  const set = new Set();
  estado.tipos.forEach((t) => Object.keys(t.precios).forEach((p) => set.add(p)));
  return [...set].sort((a, b) => b - a);
}

function pintarPresentaciones() {
  const cont = $("#presentaciones");
  cont.replaceChildren();
  presentacionesDisponibles().forEach((p) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(p === estado.presentacion));
    b.textContent = etiqueta(p);
    b.addEventListener("click", () => {
      estado.presentacion = p;
      pintarPresentaciones();
      pintarProductos();
    });
    cont.append(b);
  });
}

function pintarProductos() {
  const cont = $("#productos");
  cont.replaceChildren();
  estado.tipos.forEach((t) => {
    const valor = t.precios[estado.presentacion];
    if (valor === undefined) return;
    const art = document.createElement("article");
    art.className = "tarjeta producto";

    const h = document.createElement("h3");
    h.textContent = t.tipo;
    const peso = document.createElement("p");
    peso.className = "producto-peso";
    peso.textContent = t.peso;
    const pr = document.createElement("p");
    pr.className = "producto-precio";
    pr.textContent = cop(valor);
    const unidad = document.createElement("p");
    unidad.className = "producto-unidad";
    unidad.textContent = `${etiqueta(estado.presentacion)} · ${cop(valor / Number(estado.presentacion))} por huevo`;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton boton-secundario";
    b.textContent = "Agregar al pedido";
    b.addEventListener("click", () => {
      agregar(t.tipo, estado.presentacion, 1);
      b.textContent = "Agregado ✓";
      setTimeout(() => (b.textContent = "Agregar al pedido"), 1200);
    });

    art.append(h, peso, pr, unidad, b);
    cont.append(art);
  });
}

// ---------------------------------------------------------------
// Pedido
// ---------------------------------------------------------------
function guardarPedido() {
  try { localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(estado.pedido)); } catch (e) {}
}

function leerPedido() {
  try {
    const datos = JSON.parse(localStorage.getItem(CLAVE_PEDIDO) || "[]");
    // Descarta productos que ya no existen o cambiaron de presentación.
    return Array.isArray(datos)
      ? datos.filter((i) => precio(i.tipo, i.presentacion) !== undefined && i.cantidad > 0)
      : [];
  } catch (e) {
    return [];
  }
}

function agregar(tipo, presentacion, cantidad) {
  const existente = estado.pedido.find((i) => i.tipo === tipo && i.presentacion === presentacion);
  if (existente) existente.cantidad = Math.min(99, existente.cantidad + cantidad);
  else estado.pedido.push({ tipo, presentacion, cantidad });
  guardarPedido();
  pintarPedido();
}

function entregaADomicilio() {
  return document.querySelector('input[name="entrega"]:checked')?.value !== "recoger";
}

function calcular() {
  const subtotal = estado.pedido.reduce((s, i) => s + precio(i.tipo, i.presentacion) * i.cantidad, 0);
  const domicilio = estado.pedido.length && entregaADomicilio() ? estado.sitio.domicilio?.valor || 0 : 0;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

function pintarPedido() {
  const lista = $("#lista-pedido");
  lista.replaceChildren();
  estado.pedido.forEach((item, indice) => {
    const li = document.createElement("li");
    li.className = "item-pedido";
    const desc = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = `${item.cantidad} × ${item.tipo}`;
    const det = document.createElement("div");
    det.className = "item-detalle";
    det.textContent = etiqueta(item.presentacion);
    desc.append(nombre, det);

    const pr = document.createElement("span");
    pr.className = "item-precio";
    pr.textContent = cop(precio(item.tipo, item.presentacion) * item.cantidad);

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "boton-icono quitar";
    quitar.setAttribute("aria-label", `Quitar ${item.tipo} ${etiqueta(item.presentacion)}`);
    quitar.textContent = "×";
    quitar.addEventListener("click", () => {
      estado.pedido.splice(indice, 1);
      guardarPedido();
      pintarPedido();
    });

    li.append(desc, pr, quitar);
    lista.append(li);
  });

  const { subtotal, domicilio, total } = calcular();
  const hayItems = estado.pedido.length > 0;
  $("#pedido-vacio").hidden = hayItems;
  $("#subtotal").textContent = cop(subtotal);
  $("#costo-domicilio").textContent = entregaADomicilio() ? cop(domicilio) : "Gratis";
  $("#total").textContent = cop(total);

  const dom = entregaADomicilio();
  $("#campo-direccion").hidden = !dom;
  $("#cliente-direccion").required = dom;

  const wa = numeroWhatsApp(estado.sitio.whatsapp);
  $("#boton-enviar").disabled = !hayItems || !wa;
  $("#aviso-envio").textContent = !wa
    ? "Los pedidos por WhatsApp estarán disponibles pronto."
    : hayItems ? "" : "Agrega al menos un producto para enviar el pedido.";

  $("#flotante").hidden = !hayItems;
  $("#flotante-total").textContent = cop(total);
}

function mensajeWhatsApp() {
  const { subtotal, domicilio, total } = calcular();
  const dom = entregaADomicilio();
  const lineas = [
    `Hola ${estado.sitio.nombre}, quiero hacer un pedido:`,
    "",
    ...estado.pedido.map(
      (i) => `• ${i.cantidad} × ${i.tipo} – ${etiqueta(i.presentacion)}: ${cop(precio(i.tipo, i.presentacion) * i.cantidad)}`
    ),
    "",
    `Subtotal: ${cop(subtotal)}`,
    dom ? `Domicilio: ${cop(domicilio)}` : "Recojo en la granja",
    `Total estimado: ${cop(total)}`,
    "",
    `Nombre: ${$("#cliente-nombre").value.trim()}`,
  ];
  if (dom) lineas.push(`Dirección: ${$("#cliente-direccion").value.trim()}`);
  const nota = $("#cliente-nota").value.trim();
  if (nota) lineas.push(`Nota: ${nota}`);
  return lineas.join("\n");
}

// ---------------------------------------------------------------
// Formularios y tema
// ---------------------------------------------------------------
function prepararFormularios() {
  const selTipo = $("#agregar-tipo");
  const selPres = $("#agregar-presentacion");
  selTipo.replaceChildren(...estado.tipos.map((t) => new Option(`${t.tipo} (${t.peso})`, t.tipo)));

  const llenarPresentaciones = () => {
    const t = estado.tipos.find((x) => x.tipo === selTipo.value);
    const opciones = Object.keys(t?.precios || {}).sort((a, b) => b - a);
    selPres.replaceChildren(...opciones.map((p) => new Option(`${etiqueta(p)} · ${cop(t.precios[p])}`, p)));
  };
  selTipo.addEventListener("change", llenarPresentaciones);
  llenarPresentaciones();

  const cantidad = $("#agregar-cantidad");
  document.querySelectorAll("[data-paso]").forEach((b) =>
    b.addEventListener("click", () => {
      cantidad.value = Math.min(99, Math.max(1, (Number(cantidad.value) || 1) + Number(b.dataset.paso)));
    })
  );

  $("#form-agregar").addEventListener("submit", (e) => {
    e.preventDefault();
    const n = Math.min(99, Math.max(1, Math.floor(Number(cantidad.value) || 1)));
    agregar(selTipo.value, selPres.value, n);
    cantidad.value = 1;
  });

  document.querySelectorAll('input[name="entrega"]').forEach((r) => r.addEventListener("change", pintarPedido));

  $("#form-enviar").addEventListener("submit", (e) => {
    e.preventDefault();
    const wa = numeroWhatsApp(estado.sitio.whatsapp);
    if (!wa || !estado.pedido.length) return;
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(mensajeWhatsApp())}`, "_blank", "noopener");
  });
}

function prepararTema() {
  $("#cambiar-tema").addEventListener("click", () => {
    const raiz = document.documentElement;
    const oscuroActual = raiz.dataset.tema
      ? raiz.dataset.tema === "oscuro"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    raiz.dataset.tema = oscuroActual ? "claro" : "oscuro";
    try { localStorage.setItem("tema", raiz.dataset.tema); } catch (e) {}
  });
}

// ---------------------------------------------------------------
// Inicio
// ---------------------------------------------------------------
async function iniciar() {
  prepararTema();
  try {
    const [sitio, precios] = await Promise.all([cargarJSON("sitio.json"), cargarJSON("precios.json")]);
    estado.sitio = sitio;
    estado.tipos = precios.tipos;
    const disp = presentacionesDisponibles();
    if (!disp.includes(estado.presentacion)) estado.presentacion = disp[0];

    if (precios.actualizado) {
      const f = new Date(precios.actualizado);
      $("#precios-actualizados").textContent =
        "Precios actualizados el " + f.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
    }

    pintarSitio();
    pintarPresentaciones();
    pintarProductos();
    prepararFormularios();
    estado.pedido = leerPedido();
    pintarPedido();
  } catch (error) {
    console.error(error);
    $("#productos").innerHTML = '<p class="error-carga">No pudimos cargar los precios. Recarga la página en un momento.</p>';
  }
}

iniciar();
