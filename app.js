// Página de clientes: catálogo, disponibilidad, armador de pedido y envío por WhatsApp.
// Datos: sitio.json (negocio, editable a mano) y precios.json (publicado
// automáticamente desde la app interna con precios y huevos disponibles).
// Expone window.Tienda para el asistente de ventas (chat.js).

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
const POCAS_UNIDADES = 60;          // por debajo se muestra "Quedan pocas"
const HORAS_DATOS_VIEJOS = 24;      // aviso si la disponibilidad lleva más tiempo sin actualizarse

const $ = (sel) => document.querySelector(sel);
const cop = (n) => "$ " + Math.round(n).toLocaleString("es-CO");
const etiqueta = (p) => ETIQUETAS[p] || `${p} u.`;

const estado = {
  sitio: null,
  tipos: [],            // [{tipo, peso, disponible, precios: {"30": 15000, ...}}]
  actualizado: null,    // Date de la última publicación del catálogo
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

function infoTipo(tipo) {
  return estado.tipos.find((x) => x.tipo === tipo);
}

function precio(tipo, presentacion) {
  return infoTipo(tipo)?.precios[presentacion];
}

// ---------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------
/** Huevos disponibles de un tipo, o Infinity si el catálogo no trae el dato. */
function disponible(tipo) {
  const d = infoTipo(tipo)?.disponible;
  return typeof d === "number" ? d : Infinity;
}

function unidadesEnPedido(tipo, ignorarIndice = -1) {
  return estado.pedido.reduce(
    (s, i, indice) => (i.tipo === tipo && indice !== ignorarIndice ? s + Number(i.presentacion) * i.cantidad : s),
    0
  );
}

/** {clase, texto} para la etiqueta de disponibilidad de un tipo. */
function estadoStock(tipo) {
  const d = disponible(tipo);
  if (d === Infinity) return null;
  if (d <= 0) return { clase: "stock-no", texto: "Agotado" };
  if (d < POCAS_UNIDADES) return { clase: "stock-poco", texto: d === 1 ? "Queda 1 huevo" : `Quedan ${d} huevos` };
  return { clase: "stock-si", texto: "Disponible" };
}

/** Cuántos paquetes más de esa presentación caben en lo disponible. */
function maximoAgregable(tipo, presentacion) {
  const libre = disponible(tipo) - unidadesEnPedido(tipo);
  return libre === Infinity ? 99 : Math.max(0, Math.floor(libre / Number(presentacion)));
}

function datosViejos() {
  return estado.actualizado && Date.now() - estado.actualizado.getTime() > HORAS_DATOS_VIEJOS * 3600e3;
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
  // Filas opcionales: se ocultan si el dato está vacío en sitio.json.
  document.querySelectorAll("[data-si-hay]").forEach((el) => {
    el.hidden = !String(s[el.dataset.siHay] || "").trim();
  });
  document.title = `${s.nombre} · Huevos frescos`;
  $("#anio").textContent = new Date().getFullYear();

  if (!s.direccion) $("#fila-direccion").hidden = true;
  if (s.mapa_url) $("#enlace-mapa").href = s.mapa_url;
  else $("#enlace-mapa").hidden = true;

  const c = s.coordenadas;
  if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) {
    const caja = [c.lon - 0.012, c.lat - 0.008, c.lon + 0.012, c.lat + 0.008].join(",");
    $("#mapa").src = `https://www.openstreetmap.org/export/embed.html?bbox=${caja}&layer=mapnik&marker=${c.lat},${c.lon}`;
    $("#como-llegar").href = `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}`;
    $("#bloque-mapa").hidden = false;
  }

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
    const stock = estadoStock(t.tipo);
    const art = document.createElement("article");
    art.className = "tarjeta producto" + (stock?.clase === "stock-no" ? " agotado" : "");

    const h = document.createElement("h3");
    h.textContent = t.tipo;
    const peso = document.createElement("p");
    peso.className = "producto-peso";
    peso.textContent = t.peso;
    art.append(h, peso);

    if (stock) {
      const etiquetaStock = document.createElement("span");
      etiquetaStock.className = `stock ${stock.clase}`;
      etiquetaStock.textContent = stock.texto;
      art.append(etiquetaStock);
    }

    const pr = document.createElement("p");
    pr.className = "producto-precio";
    pr.textContent = cop(valor);
    const unidad = document.createElement("p");
    unidad.className = "producto-unidad";
    unidad.textContent = `${etiqueta(estado.presentacion)} · ${cop(valor / Number(estado.presentacion))} por huevo`;

    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton boton-secundario";
    const puede = maximoAgregable(t.tipo, estado.presentacion) > 0;
    b.textContent = puede ? "Agregar al pedido" : (stock?.clase === "stock-no" ? "Agotado" : "Sin unidades suficientes");
    b.disabled = !puede;
    b.addEventListener("click", () => {
      if (agregar(t.tipo, estado.presentacion, 1).ok) {
        b.textContent = "Agregado ✓";
        setTimeout(pintarProductos, 1200);
      }
    });

    art.append(pr, unidad, b);
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

/**
 * Agrega paquetes respetando la disponibilidad.
 * Devuelve {ok, agregados, mensaje}.
 */
function agregar(tipo, presentacion, cantidad) {
  const maximo = maximoAgregable(tipo, presentacion);
  const agregados = Math.min(cantidad, maximo);
  if (agregados <= 0) {
    const libre = Math.max(0, disponible(tipo) - unidadesEnPedido(tipo));
    return {
      ok: false,
      agregados: 0,
      mensaje: libre > 0
        ? `Solo ${libre === 1 ? "queda 1 huevo" : `quedan ${libre} huevos`} ${tipo} disponibles; prueba una presentación más pequeña.`
        : `No tenemos más huevos ${tipo} disponibles en este momento.`,
    };
  }
  const existente = estado.pedido.find((i) => i.tipo === tipo && i.presentacion === presentacion);
  if (existente) existente.cantidad += agregados;
  else estado.pedido.push({ tipo, presentacion, cantidad: agregados });
  guardarPedido();
  pintarPedido();
  pintarProductos();
  return {
    ok: true,
    agregados,
    mensaje: agregados < cantidad
      ? `Solo había disponibilidad para ${agregados} ${agregados === 1 ? "paquete" : "paquetes"}.`
      : "",
  };
}

function entregaADomicilio() {
  return document.querySelector('input[name="entrega"]:checked')?.value !== "recoger";
}

function calcular() {
  const subtotal = estado.pedido.reduce((s, i) => s + precio(i.tipo, i.presentacion) * i.cantidad, 0);
  const domicilio = estado.pedido.length && entregaADomicilio() ? estado.sitio.domicilio?.valor || 0 : 0;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

/** Tipos cuyo pedido supera lo disponible (p. ej. un carrito guardado de otro día). */
function tiposExcedidos() {
  return [...new Set(estado.pedido.map((i) => i.tipo))].filter((t) => unidadesEnPedido(t) > disponible(t));
}

function pintarPedido() {
  const lista = $("#lista-pedido");
  lista.replaceChildren();
  const excedidos = tiposExcedidos();
  estado.pedido.forEach((item, indice) => {
    const li = document.createElement("li");
    li.className = "item-pedido" + (excedidos.includes(item.tipo) ? " item-excede" : "");
    const desc = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = `${item.cantidad} × ${item.tipo}`;
    const det = document.createElement("div");
    det.className = "item-detalle";
    det.textContent = excedidos.includes(item.tipo)
      ? `${etiqueta(item.presentacion)} · supera lo disponible (${Math.max(0, disponible(item.tipo))} huevos)`
      : etiqueta(item.presentacion);
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
      pintarProductos();
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
  $("#boton-enviar").disabled = !hayItems || !wa || excedidos.length > 0;
  $("#aviso-envio").textContent = !wa
    ? "Los pedidos por WhatsApp estarán disponibles pronto."
    : excedidos.length
      ? `Ajusta tu pedido: no hay suficientes huevos ${excedidos.join(", ")}.`
      : hayItems ? "" : "Agrega al menos un producto para enviar el pedido.";

  $("#flotante").hidden = !hayItems;
  $("#flotante-total").textContent = cop(total);
  document.dispatchEvent(new CustomEvent("tienda:pedido"));
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
  selTipo.replaceChildren(...estado.tipos.map((t) => {
    const agotado = disponible(t.tipo) <= 0;
    const op = new Option(`${t.tipo} (${t.peso})${agotado ? " – agotado" : ""}`, t.tipo);
    op.disabled = agotado;
    return op;
  }));
  const primero = estado.tipos.find((t) => disponible(t.tipo) > 0);
  if (primero) selTipo.value = primero.tipo;

  const llenarPresentaciones = () => {
    const t = infoTipo(selTipo.value);
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
    const r = agregar(selTipo.value, selPres.value, n);
    $("#aviso-agregar").textContent = r.mensaje;
    if (r.ok) cantidad.value = 1;
  });

  document.querySelectorAll('input[name="entrega"]').forEach((r) => r.addEventListener("change", pintarPedido));

  $("#form-enviar").addEventListener("submit", (e) => {
    e.preventDefault();
    const wa = numeroWhatsApp(estado.sitio.whatsapp);
    if (!wa || !estado.pedido.length || tiposExcedidos().length) return;
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

// Interfaz para el asistente de ventas (chat.js).
window.Tienda = {
  estado, cop, etiqueta, precio, disponible, estadoStock, agregar, calcular,
  numeroWhatsApp, datosViejos, maximoAgregable, unidadesEnPedido,
  irAlPedido() {
    $("#pedido").scrollIntoView({ behavior: "smooth" });
    setTimeout(() => $("#cliente-nombre").focus({ preventScroll: true }), 500);
  },
};

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
      estado.actualizado = new Date(precios.actualizado);
      const fecha = estado.actualizado.toLocaleString("es-CO", {
        day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
      });
      $("#precios-actualizados").textContent = datosViejos()
        ? `Disponibilidad del ${fecha}. Puede haber cambiado; la confirmamos por WhatsApp.`
        : `Precios y disponibilidad actualizados el ${fecha}`;
    }

    pintarSitio();
    pintarPresentaciones();
    estado.pedido = leerPedido();
    pintarProductos();
    prepararFormularios();
    pintarPedido();
    document.dispatchEvent(new CustomEvent("tienda:lista"));
  } catch (error) {
    console.error(error);
    $("#productos").innerHTML = '<p class="error-carga">No pudimos cargar los precios. Recarga la página en un momento.</p>';
  }
}

iniciar();
