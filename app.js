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
  // [{tipo, presentacion, cantidad}] o, para un panal mixto,
  // [{mixto: true, composicion: {"Tipo A": 10, ...}, cantidad}]
  pedido: [],
};
const HUEVOS_POR_PANAL = 30;

// ---------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------
async function cargarJSON(ruta) {
  const r = await fetch(ruta, { cache: "no-store" });
  if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
  return r.json();
}

/**
 * Catálogo con precios y disponibilidad. Se lee también directo del
 * repositorio (sitio.json > fuente_precios): así el stock se actualiza
 * sin volver a publicar la página, y el hosting no gasta publicaciones.
 * Se usa la copia más reciente entre la remota y la local.
 */
async function cargarPrecios() {
  const fuente = estado.sitio?.fuente_precios;
  const intentos = [cargarJSON("precios.json")];
  if (fuente) intentos.push(cargarJSON(`${fuente}?t=${Date.now()}`));
  const resultados = (await Promise.allSettled(intentos))
    .filter((r) => r.status === "fulfilled" && Array.isArray(r.value?.tipos))
    .map((r) => r.value);
  if (!resultados.length) throw new Error("No se pudo cargar el catálogo");
  return resultados.sort((a, b) => new Date(b.actualizado || 0) - new Date(a.actualizado || 0))[0];
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

// ---------------------------------------------------------------
// Panal mixto
// ---------------------------------------------------------------
/** Precio de un huevo dentro del panal mixto: tarifa de cubeta (o de unidad, según sitio.json). */
function precioHuevoMixto(tipo) {
  const p = infoTipo(tipo)?.precios || {};
  if (estado.sitio?.panal_mixto?.precio_base === "unidad") return p["1"];
  return p[String(HUEVOS_POR_PANAL)] !== undefined ? p[String(HUEVOS_POR_PANAL)] / HUEVOS_POR_PANAL : p["1"];
}

/** Precio de un panal mixto, redondeado a la centena. */
function precioMixto(composicion) {
  const total = Object.entries(composicion).reduce((s, [tipo, n]) => s + (precioHuevoMixto(tipo) || 0) * n, 0);
  return Math.round(total / 100) * 100;
}

function textoComposicion(composicion) {
  return estado.tipos
    .filter((t) => composicion[t.tipo] > 0)
    .map((t) => `${composicion[t.tipo]} ${t.tipo}`)
    .join(", ");
}

function composicionValida(composicion) {
  return composicion && typeof composicion === "object"
    && Object.entries(composicion).every(([tipo, n]) => infoTipo(tipo) && Number.isInteger(n) && n >= 0)
    && Object.values(composicion).reduce((s, n) => s + n, 0) === HUEVOS_POR_PANAL;
}

/**
 * Combinaciones sugeridas de 30 huevos con lo disponible (descontando lo
 * que ya está en el pedido). Cada una: {nombre, descripcion, composicion, precio}.
 */
function opcionesMixto() {
  const tipos = estado.tipos.filter((t) => precioHuevoMixto(t.tipo) !== undefined && libre(t.tipo) > 0);
  const totalLibre = tipos.reduce((s, t) => s + Math.min(libre(t.tipo), HUEVOS_POR_PANAL), 0);
  if (totalLibre < HUEVOS_POR_PANAL) return [];

  const llenar = (orden) => {
    const comp = {};
    let falta = HUEVOS_POR_PANAL;
    for (const t of orden) {
      const n = Math.min(falta, libre(t.tipo));
      if (n > 0) comp[t.tipo] = n;
      falta -= n;
      if (!falta) break;
    }
    return comp;
  };
  const repartir = () => {
    // Reparte por turnos entre todos los tipos disponibles, de a 2 huevos.
    const comp = {};
    let falta = HUEVOS_POR_PANAL;
    while (falta > 0) {
      let avanzo = false;
      for (const t of tipos) {
        const usados = comp[t.tipo] || 0;
        const n = Math.min(2, falta, libre(t.tipo) - usados);
        if (n > 0) { comp[t.tipo] = usados + n; falta -= n; avanzo = true; }
        if (!falta) break;
      }
      if (!avanzo) break;
    }
    return comp;
  };

  const candidatas = [
    { nombre: "Económico", descripcion: "Más huevos pequeños, menor precio", composicion: llenar(tipos) },
    { nombre: "Equilibrado", descripcion: "Un poco de cada tamaño", composicion: repartir() },
    { nombre: "Más grande", descripcion: "Los tamaños más grandes disponibles", composicion: llenar([...tipos].reverse()) },
  ];
  const vistas = new Set();
  return candidatas
    .filter((o) => composicionValida(o.composicion))
    .filter((o) => {
      const clave = JSON.stringify(o.composicion);
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .map((o) => ({ ...o, precio: precioMixto(o.composicion) }))
    .sort((a, b) => a.precio - b.precio);
}

// ---------------------------------------------------------------
// Unidades del pedido
// ---------------------------------------------------------------
function unidadesDeItem(item, tipo) {
  if (item.mixto) return (item.composicion[tipo] || 0) * item.cantidad;
  return item.tipo === tipo ? Number(item.presentacion) * item.cantidad : 0;
}

function valorItem(item) {
  return item.mixto
    ? precioMixto(item.composicion) * item.cantidad
    : precio(item.tipo, item.presentacion) * item.cantidad;
}

/** {titulo, detalle} legibles para el pedido, el chat y WhatsApp. */
function describirItem(item) {
  return item.mixto
    ? { titulo: `${item.cantidad} × Panal mixto (30 u.)`, detalle: textoComposicion(item.composicion) }
    : { titulo: `${item.cantidad} × ${item.tipo}`, detalle: etiqueta(item.presentacion) };
}

function unidadesEnPedido(tipo) {
  return estado.pedido.reduce((s, i) => s + unidadesDeItem(i, tipo), 0);
}

/** Huevos de un tipo que aún se pueden agregar al pedido. */
function libre(tipo) {
  return disponible(tipo) - unidadesEnPedido(tipo);
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
  const quedan = libre(tipo);
  return quedan === Infinity ? 99 : Math.max(0, Math.floor(quedan / Number(presentacion)));
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

    // La etiqueta descuenta lo que el cliente ya tiene en su pedido.
    const enPedido = unidadesEnPedido(t.tipo);
    const quedan = Math.max(0, libre(t.tipo));
    const etiquetaInfo = enPedido > 0 && stock
      ? {
          clase: quedan === 0 ? "stock-poco" : quedan < POCAS_UNIDADES ? "stock-poco" : "stock-si",
          texto: `${enPedido} en tu pedido · ${quedan === 0 ? "no quedan más" : `quedan ${quedan}`}`,
        }
      : stock;
    if (etiquetaInfo) {
      const etiquetaStock = document.createElement("span");
      etiquetaStock.className = `stock ${etiquetaInfo.clase}`;
      etiquetaStock.textContent = etiquetaInfo.texto;
      art.append(etiquetaStock);
    }

    const pr = document.createElement("p");
    pr.className = "producto-precio";
    pr.textContent = cop(valor);
    const unidad = document.createElement("p");
    unidad.className = "producto-unidad";
    unidad.textContent = `${etiqueta(estado.presentacion)} · ${cop(valor / Number(estado.presentacion))} por huevo`;

    art.append(pr, unidad, botonProducto(t, quedan, enPedido));
    cont.append(art);
  });
}

/**
 * Botón de la tarjeta. Nunca deja al cliente sin salida:
 * agregar, cambiar a una presentación que sí alcanza, o ir a su pedido.
 */
function botonProducto(t, quedan, enPedido) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "boton boton-secundario";
  const recien = estado.recienAgregado;
  if (recien?.tipo === t.tipo && Date.now() < recien.hasta) {
    // Confirmación breve; luego se muestra la siguiente acción posible.
    b.textContent = "Agregado ✓";
    b.disabled = true;
    return b;
  }

  if (maximoAgregable(t.tipo, estado.presentacion) > 0) {
    b.textContent = "Agregar al pedido";
    b.addEventListener("click", () => {
      if (agregar(t.tipo, estado.presentacion, 1).ok) {
        estado.recienAgregado = { tipo: t.tipo, hasta: Date.now() + 1200 };
        pintarProductos();
        setTimeout(pintarProductos, 1300);
      }
    });
    return b;
  }

  const alcanza = Object.keys(t.precios)
    .filter((p) => Number(p) <= quedan)
    .sort((a, b2) => b2 - a)[0];
  if (alcanza) {
    b.textContent = `Quedan ${quedan}: ver ${etiqueta(alcanza).toLowerCase()}`;
    b.addEventListener("click", () => {
      estado.presentacion = alcanza;
      pintarPresentaciones();
      pintarProductos();
    });
  } else if (enPedido > 0) {
    b.textContent = "Ya están en tu pedido · ver pedido";
    b.addEventListener("click", () => $("#pedido").scrollIntoView({ behavior: "smooth" }));
  } else {
    b.textContent = "Agotado";
    b.disabled = true;
  }
  return b;
}

// ---------------------------------------------------------------
// Actualización de la disponibilidad mientras la página está abierta
// ---------------------------------------------------------------
const INTERVALO_REFRESCO_MS = 2 * 60 * 1000;

async function refrescarCatalogo() {
  let precios;
  try {
    precios = await cargarPrecios();
  } catch (e) {
    return; // sin conexión: se reintenta en el siguiente ciclo
  }
  if (!precios.actualizado || estado.actualizado?.toISOString() === new Date(precios.actualizado).toISOString()) return;
  estado.tipos = precios.tipos;
  estado.actualizado = new Date(precios.actualizado);
  pintarFechaCatalogo();
  pintarPresentaciones();
  pintarProductos();
  pintarSelectorTipos();
  pintarPedido();   // marca lo que ya no alcance y avisa al mixto y al chat
}

function pintarFechaCatalogo() {
  if (!estado.actualizado) return;
  const fecha = estado.actualizado.toLocaleString("es-CO", {
    day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
  });
  $("#precios-actualizados").textContent = datosViejos()
    ? `Disponibilidad del ${fecha}. Puede haber cambiado; la confirmamos por WhatsApp.`
    : `Precios y disponibilidad actualizados el ${fecha}`;
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
      ? datos.filter((i) => i.cantidad > 0 && (i.mixto
          ? composicionValida(i.composicion)
          : precio(i.tipo, i.presentacion) !== undefined))
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
    const quedan = Math.max(0, libre(tipo));
    return {
      ok: false,
      agregados: 0,
      mensaje: quedan > 0
        ? `Solo ${quedan === 1 ? "queda 1 huevo" : `quedan ${quedan} huevos`} ${tipo} disponibles; prueba una presentación más pequeña.`
        : `No tenemos más huevos ${tipo} disponibles en este momento.`,
    };
  }
  const existente = estado.pedido.find((i) => !i.mixto && i.tipo === tipo && i.presentacion === presentacion);
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

/** Agrega un panal mixto de 30 huevos. Devuelve {ok, mensaje}. */
function agregarMixto(composicion) {
  const comp = Object.fromEntries(Object.entries(composicion).filter(([, n]) => n > 0));
  if (!composicionValida(comp)) {
    return { ok: false, mensaje: `El panal debe tener exactamente ${HUEVOS_POR_PANAL} huevos.` };
  }
  const sinStock = Object.entries(comp).filter(([tipo, n]) => n > libre(tipo)).map(([tipo]) => tipo);
  if (sinStock.length) {
    return { ok: false, mensaje: `No hay suficientes huevos ${sinStock.join(", ")} para ese panal.` };
  }
  const clave = JSON.stringify(comp);
  const existente = estado.pedido.find((i) => i.mixto && JSON.stringify(i.composicion) === clave);
  if (existente) existente.cantidad += 1;
  else estado.pedido.push({ mixto: true, composicion: comp, cantidad: 1 });
  guardarPedido();
  pintarPedido();
  pintarProductos();
  return { ok: true, mensaje: "" };
}

function entregaADomicilio() {
  return document.querySelector('input[name="entrega"]:checked')?.value !== "recoger";
}

function calcular() {
  const subtotal = estado.pedido.reduce((s, i) => s + valorItem(i), 0);
  const domicilio = estado.pedido.length && entregaADomicilio() ? estado.sitio.domicilio?.valor || 0 : 0;
  return { subtotal, domicilio, total: subtotal + domicilio };
}

/** Tipos cuyo pedido supera lo disponible (p. ej. un carrito guardado de otro día). */
function tiposExcedidos() {
  return estado.tipos.map((t) => t.tipo).filter((t) => unidadesEnPedido(t) > disponible(t));
}

function itemExcede(item, excedidos) {
  return excedidos.some((tipo) => unidadesDeItem(item, tipo) > 0);
}

function pintarPedido() {
  const lista = $("#lista-pedido");
  lista.replaceChildren();
  const excedidos = tiposExcedidos();
  estado.pedido.forEach((item, indice) => {
    const li = document.createElement("li");
    const excede = itemExcede(item, excedidos);
    const { titulo, detalle } = describirItem(item);
    li.className = "item-pedido" + (excede ? " item-excede" : "");
    const desc = document.createElement("div");
    const nombre = document.createElement("strong");
    nombre.textContent = titulo;
    const det = document.createElement("div");
    det.className = "item-detalle";
    det.textContent = excede ? `${detalle} · supera lo disponible` : detalle;
    desc.append(nombre, det);

    const pr = document.createElement("span");
    pr.className = "item-precio";
    pr.textContent = cop(valorItem(item));

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "boton-icono quitar";
    quitar.setAttribute("aria-label", `Quitar ${titulo}`);
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
    ...estado.pedido.flatMap((i) => {
      const { titulo, detalle } = describirItem(i);
      return i.mixto
        ? [`• ${titulo}: ${cop(valorItem(i))}`, `   Armar cada panal con: ${detalle}`]
        : [`• ${titulo} – ${detalle}: ${cop(valorItem(i))}`];
    }),
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
function llenarPresentacionesForm() {
  const selPres = $("#agregar-presentacion");
  const anterior = selPres.value;
  const t = infoTipo($("#agregar-tipo").value);
  const opciones = Object.keys(t?.precios || {}).sort((a, b) => b - a);
  selPres.replaceChildren(...opciones.map((p) => new Option(`${etiqueta(p)} · ${cop(t.precios[p])}`, p)));
  if (opciones.includes(anterior)) selPres.value = anterior;
}

/** Llena el selector de tipos; conserva la elección si sigue disponible. */
function pintarSelectorTipos() {
  const selTipo = $("#agregar-tipo");
  const anterior = selTipo.value;
  selTipo.replaceChildren(...estado.tipos.map((t) => {
    const agotado = disponible(t.tipo) <= 0;
    const op = new Option(`${t.tipo} (${t.peso})${agotado ? " – agotado" : ""}`, t.tipo);
    op.disabled = agotado;
    return op;
  }));
  const sigue = estado.tipos.find((t) => t.tipo === anterior && disponible(t.tipo) > 0);
  const primero = sigue || estado.tipos.find((t) => disponible(t.tipo) > 0);
  if (primero) selTipo.value = primero.tipo;
  llenarPresentacionesForm();
}

function prepararFormularios() {
  const selTipo = $("#agregar-tipo");
  const selPres = $("#agregar-presentacion");
  pintarSelectorTipos();
  selTipo.addEventListener("change", llenarPresentacionesForm);

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
  numeroWhatsApp, datosViejos, maximoAgregable, unidadesEnPedido, libre,
  agregarMixto, opcionesMixto, precioMixto, precioHuevoMixto, textoComposicion,
  describirItem, valorItem, HUEVOS_POR_PANAL,
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
    estado.sitio = await cargarJSON("sitio.json");
    const precios = await cargarPrecios();
    estado.tipos = precios.tipos;
    const disp = presentacionesDisponibles();
    if (!disp.includes(estado.presentacion)) estado.presentacion = disp[0];

    if (precios.actualizado) estado.actualizado = new Date(precios.actualizado);
    pintarFechaCatalogo();

    pintarSitio();
    pintarPresentaciones();
    estado.pedido = leerPedido();
    pintarProductos();
    prepararFormularios();
    pintarPedido();
    document.dispatchEvent(new CustomEvent("tienda:lista"));

    // Mantiene la disponibilidad al día sin recargar la página.
    setInterval(refrescarCatalogo, INTERVALO_REFRESCO_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refrescarCatalogo();
    });
  } catch (error) {
    console.error(error);
    $("#productos").innerHTML = '<p class="error-carga">No pudimos cargar los precios. Recarga la página en un momento.</p>';
  }
}

iniciar();
