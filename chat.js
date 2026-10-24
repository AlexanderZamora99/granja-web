// Asistente de ventas sin IA de pago: flujos guiados con botones y
// reconocimiento de frases comunes ("quiero 2 cubetas AA", "¿cuánto vale?",
// "¿hacen domicilio?"). Usa window.Tienda (app.js) para precios,
// disponibilidad y el pedido, así nunca ofrece huevos que no hay.

(() => {
  const T = () => window.Tienda;
  const CLAVE_SALUDO = "chat-saludo-visto";

  // Preferencias de tamaño por uso, de mejor a alternativa.
  const USOS = {
    casa: {
      texto: "Casa / familia",
      tipos: ["Tipo AA", "Tipo A", "Tipo AAA", "Tipo B"],
      razon: "es el tamaño más versátil para el desayuno y la cocina diaria",
    },
    panaderia: {
      texto: "Panadería / repostería",
      tipos: ["Tipo B", "Tipo A", "Tipo C", "Tipo AA"],
      razon: "en masas y recetas rinde muy bien y cuesta menos por huevo",
    },
    restaurante: {
      texto: "Restaurante / comidas",
      tipos: ["Tipo AA", "Tipo AAA", "Tipo A"],
      razon: "se ve bien en el plato y mantiene un buen precio por huevo",
    },
    reventa: {
      texto: "Tienda / reventa",
      tipos: ["Tipo A", "Tipo AA", "Tipo B", "Tipo AAA"],
      razon: "es de los tamaños que más rotan en tienda",
    },
  };
  const CONSUMOS = [
    { texto: "Unos 15", presentacion: "15", paquetes: 1 },
    { texto: "Unos 30", presentacion: "30", paquetes: 1 },
    { texto: "Unos 60", presentacion: "30", paquetes: 2 },
    { texto: "90 o más", presentacion: "30", paquetes: 3 },
  ];

  let panel, mensajes, opciones, entrada, lanzador, burbuja;
  let iniciado = false;

  // -------------------------------------------------------------
  // Utilidades de interfaz
  // -------------------------------------------------------------
  function crear(etiqueta, clase, texto) {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  /** Texto con **negritas** convertido a nodos seguros (sin innerHTML). */
  function conFormato(texto) {
    const frag = document.createDocumentFragment();
    String(texto).split(/(\*\*[^*]+\*\*)/).forEach((parte) => {
      if (/^\*\*[^*]+\*\*$/.test(parte)) frag.append(crear("strong", "", parte.slice(2, -2)));
      else frag.append(document.createTextNode(parte));
    });
    return frag;
  }

  function decir(...lineas) {
    const burbujaBot = crear("div", "msg msg-bot");
    lineas.filter(Boolean).forEach((linea, i) => {
      if (i) burbujaBot.append(document.createElement("br"));
      burbujaBot.append(conFormato(linea));
    });
    mensajes.append(burbujaBot);
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  function decirUsuario(texto) {
    mensajes.append(crear("div", "msg msg-usuario", texto));
    mensajes.scrollTop = mensajes.scrollHeight;
  }

  /** Reemplaza los botones de respuesta rápida. */
  function ofrecer(lista) {
    opciones.replaceChildren();
    lista.filter(Boolean).forEach(({ texto, accion, enlace }) => {
      let el;
      if (enlace) {
        el = crear("a", "chip chip-chat", texto);
        el.href = enlace;
        el.target = "_blank";
        el.rel = "noopener";
      } else {
        el = crear("button", "chip chip-chat", texto);
        el.type = "button";
        el.addEventListener("click", () => {
          decirUsuario(texto);
          accion();
        });
      }
      opciones.append(el);
    });
  }

  const volverAlMenu = { texto: "Menú", accion: () => menu() };

  function chipPersona() {
    const wa = T().numeroWhatsApp(T().estado.sitio?.whatsapp);
    if (!wa) return null;
    const texto = encodeURIComponent(`Hola ${T().estado.sitio.nombre}, tengo una pregunta.`);
    return { texto: "Hablar con una persona", enlace: `https://wa.me/${wa}?text=${texto}` };
  }

  // -------------------------------------------------------------
  // Flujos
  // -------------------------------------------------------------
  function menu(saludo = false) {
    if (saludo) {
      decir(`¡Hola! Soy el asistente de **${T().estado.sitio.nombre}** 🥚`,
            "Te ayudo a elegir tus huevos, ver qué hay disponible y armar tu pedido.");
    } else {
      decir("¿En qué más te ayudo?");
    }
    ofrecer([
      { texto: "¿Qué tamaño me conviene?", accion: preguntarUso },
      { texto: "¿Qué hay disponible?", accion: disponibilidad },
      { texto: "Precios", accion: precios },
      { texto: "Domicilio y ubicación", accion: domicilio },
      T().estado.pedido.length ? { texto: "Ver mi pedido", accion: verPedido } : null,
      chipPersona(),
    ]);
  }

  function preguntarUso() {
    decir("¿Para qué los vas a usar?");
    ofrecer(Object.entries(USOS).map(([clave, uso]) => ({
      texto: uso.texto,
      accion: () => preguntarConsumo(clave),
    })));
  }

  function preguntarConsumo(uso) {
    decir("¿Cuántos huevos usas más o menos a la semana?");
    ofrecer(CONSUMOS.map((c) => ({ texto: c.texto, accion: () => recomendar(uso, c) })));
  }

  /**
   * Busca el primer tipo preferido con disponibilidad. Si la presentación
   * pedida no alcanza, prueba presentaciones más pequeñas que cubran lo
   * más posible de los huevos que el cliente quiere.
   */
  function elegirOpcion(tipos, presentacion, paquetes, excluir = []) {
    const t = T();
    const unidades = Number(presentacion) * paquetes;
    for (const tipo of tipos) {
      if (excluir.includes(tipo)) continue;
      const info = t.estado.tipos.find((x) => x.tipo === tipo);
      if (!info) continue;
      const candidatas = [presentacion, ...Object.keys(info.precios)
        .filter((p) => Number(p) < Number(presentacion) && Number(p) > 1)
        .sort((a, b) => b - a)];
      for (const p of candidatas) {
        if (t.precio(tipo, p) === undefined) continue;
        const deseados = Math.max(1, Math.floor(unidades / Number(p)));
        const cabe = Math.min(deseados, t.maximoAgregable(tipo, p));
        if (cabe > 0) return { tipo, presentacion: p, paquetes: cabe, deseados };
      }
    }
    return null;
  }

  function recomendar(uso, consumo, excluir = []) {
    const t = T();
    const info = USOS[uso];
    const opcion = elegirOpcion(info.tipos, consumo.presentacion, consumo.paquetes, excluir)
      || elegirOpcion(t.estado.tipos.map((x) => x.tipo), consumo.presentacion, consumo.paquetes, excluir);

    if (!opcion) {
      decir("Ahora mismo no tengo huevos disponibles para esa cantidad 😕.",
            "Escríbenos y te avisamos apenas tengamos.");
      ofrecer([chipPersona(), volverAlMenu]);
      return;
    }

    const valor = t.precio(opcion.tipo, opcion.presentacion) * opcion.paquetes;
    const porHuevo = t.precio(opcion.tipo, opcion.presentacion) / Number(opcion.presentacion);
    const preferido = opcion.tipo === info.tipos[0];
    decir(
      `Te recomiendo **${opcion.paquetes} × ${opcion.tipo}** – ${t.etiqueta(opcion.presentacion)} por **${t.cop(valor)}**.`,
      preferido ? `El ${opcion.tipo} ${info.razon}.` : `Es la mejor opción que tengo disponible ahora para ti.`,
      `Cada huevo te sale a ${t.cop(porHuevo)}.`,
      opcion.presentacion !== consumo.presentacion || opcion.paquetes < opcion.deseados
        ? `Es lo que me alcanza con la disponibilidad de hoy.`
        : ""
    );

    const acciones = [
      { texto: "Agregar al pedido", accion: () => agregarYCerrar(opcion) },
    ];
    // Venta sugerida: la cubeta suele salir más barata por huevo.
    if (opcion.presentacion !== "30" && t.maximoAgregable(opcion.tipo, "30") > 0) {
      const cubeta = t.precio(opcion.tipo, "30");
      const diferencia = cubeta - valor;
      if (cubeta && diferencia > 0) {
        decir(`💡 Por **${t.cop(diferencia)}** más llevas la cubeta de 30 y cada huevo te sale a ${t.cop(cubeta / 30)}.`);
        acciones.push({
          texto: "Mejor la cubeta",
          accion: () => agregarYCerrar({ tipo: opcion.tipo, presentacion: "30", paquetes: 1 }),
        });
      }
    }
    acciones.push(
      { texto: "Otra opción", accion: () => recomendar(uso, consumo, [...excluir, opcion.tipo]) },
      volverAlMenu,
    );
    ofrecer(acciones);
  }

  function agregarYCerrar({ tipo, presentacion, paquetes }) {
    const t = T();
    const r = t.agregar(tipo, presentacion, paquetes);
    if (!r.ok) {
      decir(r.mensaje);
      ofrecer([{ texto: "¿Qué hay disponible?", accion: disponibilidad }, volverAlMenu]);
      return;
    }
    const { total } = t.calcular();
    decir(
      `¡Listo! ✅ Agregué ${r.agregados} × ${tipo} – ${t.etiqueta(presentacion).replace(/\.$/, "")}.`,
      r.mensaje,
      `Tu pedido va en **${t.cop(total)}** con domicilio incluido.`,
    );
    ofrecer([
      { texto: "Finalizar pedido", accion: finalizar },
      { texto: "Agregar algo más", accion: preguntarUso },
      { texto: "Ver mi pedido", accion: verPedido },
    ]);
  }

  function finalizar() {
    decir("Perfecto 🙌. Escribe tu nombre y dirección en el formulario y pulsa **Enviar pedido por WhatsApp**.",
          "Ahí confirmamos tu pedido y la hora de entrega.");
    ofrecer([volverAlMenu]);
    if (matchMedia("(max-width: 640px)").matches) cerrar();
    T().irAlPedido();
  }

  function verPedido() {
    const t = T();
    if (!t.estado.pedido.length) {
      decir("Tu pedido está vacío por ahora.");
      ofrecer([{ texto: "¿Qué tamaño me conviene?", accion: preguntarUso }, volverAlMenu]);
      return;
    }
    const { subtotal, domicilio: dom, total } = t.calcular();
    decir(
      "Tu pedido:",
      ...t.estado.pedido.map((i) => `• ${i.cantidad} × ${i.tipo} – ${t.etiqueta(i.presentacion)}`),
      `Subtotal ${t.cop(subtotal)} · Domicilio ${t.cop(dom)}`,
      `**Total ${t.cop(total)}**`,
    );
    ofrecer([{ texto: "Finalizar pedido", accion: finalizar }, { texto: "Agregar algo más", accion: preguntarUso }]);
  }

  function disponibilidad() {
    const t = T();
    const lineas = t.estado.tipos.map((x) => {
      const s = t.estadoStock(x.tipo);
      return `• **${x.tipo}** (${x.peso}): ${s ? s.texto : "consultar"}`;
    });
    decir("Esto es lo que tengo ahora:", ...lineas,
          t.datosViejos() ? "La lista puede haber cambiado; la confirmamos por WhatsApp." : "");
    ofrecer([{ texto: "¿Qué tamaño me conviene?", accion: preguntarUso }, { texto: "Precios", accion: precios }, volverAlMenu]);
  }

  function precios() {
    const t = T();
    const lineas = t.estado.tipos.map((x) => {
      const cubeta = x.precios["30"];
      const agotado = t.disponible(x.tipo) <= 0 ? " · agotado" : "";
      return cubeta
        ? `• **${x.tipo}**: cubeta ${t.cop(cubeta)} (${t.cop(cubeta / 30)} c/u)${agotado}`
        : `• **${x.tipo}**${agotado}`;
    });
    decir("Precios por cubeta de 30:", ...lineas, "También vendemos cartones, media docena y unidades.");
    ofrecer([
      { texto: "Ver catálogo completo", accion: () => { document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth" }); if (matchMedia("(max-width: 640px)").matches) cerrar(); } },
      { texto: "¿Qué tamaño me conviene?", accion: preguntarUso },
      volverAlMenu,
    ]);
  }

  function domicilio() {
    const t = T();
    const s = t.estado.sitio;
    const c = s.coordenadas;
    decir(
      `🛵 El domicilio vale **${t.cop(s.domicilio?.valor || 0)}**.`,
      s.zona_entrega ? `Entregamos en: ${s.zona_entrega}.` : "",
      s.permite_recoger ? "También puedes recoger tu pedido gratis en la granja." : "",
      s.direccion ? `📍 ${s.direccion}` : "",
      s.horario ? `🕒 ${s.horario}` : "",
    );
    ofrecer([
      c ? { texto: "Cómo llegar", enlace: `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lon}` } : null,
      { texto: "¿Qué tamaño me conviene?", accion: preguntarUso },
      volverAlMenu,
    ]);
  }

  function infoDeTipo(tipo) {
    const t = T();
    const x = t.estado.tipos.find((y) => y.tipo === tipo);
    const s = t.estadoStock(tipo);
    const presentaciones = Object.keys(x.precios).sort((a, b) => b - a).slice(0, 4)
      .map((p) => `• ${t.etiqueta(p)}: ${t.cop(x.precios[p])}`);
    decir(`**${tipo}** (${x.peso})${s ? " · " + s.texto : ""}`, ...presentaciones);
    ofrecer([
      t.maximoAgregable(tipo, "30") > 0
        ? { texto: `Agregar 1 cubeta ${tipo}`, accion: () => agregarYCerrar({ tipo, presentacion: "30", paquetes: 1 }) }
        : null,
      { texto: "¿Qué hay disponible?", accion: disponibilidad },
      volverAlMenu,
    ]);
  }

  // -------------------------------------------------------------
  // Texto libre
  // -------------------------------------------------------------
  const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const NUMEROS = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

  function detectarTipo(txt) {
    if (/\bjumbo\b/.test(txt)) return "Jumbo";
    // "huevos a domicilio" no es Tipo A.
    const m = txt.match(/\b(?:tipo|huevos?|de)\s*(aaa|aa|a|b|c)\b(?!\s*domicilio)/) || txt.match(/\b(aaa|aa)\b/);
    return m ? `Tipo ${m[1].toUpperCase()}` : null;
  }

  function detectarPresentacion(txt) {
    if (/media docena/.test(txt)) return "6";
    if (/cubetas?|panal(es)?/.test(txt)) return "30";
    if (/(carton|paquete)(es|s)? de 12|docenas?/.test(txt)) return "12";
    if (/(carton|paquete)(es|s)? de 10/.test(txt)) return "10";
    if (/(carton|paquete)(es|s)? de 20/.test(txt)) return "20";
    if (/cartones|carton/.test(txt)) return "15";
    if (/unidad(es)?|sueltos?/.test(txt)) return "1";
    return null;
  }

  function detectarCantidad(txt) {
    const m = txt.match(/\b(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(?:media docena|cubetas?|panal(?:es)?|cartone?s?|paquetes?|docenas?|unidad(?:es)?|huevos?)/);
    if (!m) return 1;
    return NUMEROS[m[1]] || Number(m[1]) || 1;
  }

  function responderTexto(original) {
    const txt = normalizar(original);
    if (!txt) return;
    const tipo = detectarTipo(txt);
    const presentacion = detectarPresentacion(txt);
    const esPregunta = /\?|cuanto|precio|vale|cuesta|valor|hay|tienen/.test(txt);

    if (tipo && presentacion && !esPregunta) {
      if (T().precio(tipo, presentacion) === undefined) {
        decir(`No manejo ${T().etiqueta(presentacion)} en ${tipo}.`);
        return infoDeTipo(tipo);
      }
      return agregarYCerrar({ tipo, presentacion, paquetes: detectarCantidad(txt) });
    }
    if (tipo) return infoDeTipo(tipo);
    if (/^(hola|buenas|buenos|hey|que tal)/.test(txt)) return menu(true);
    if (/gracias/.test(txt)) {
      decir("¡Con gusto! 😊");
      return menu();
    }
    if (/horario|hora|abren|atienden/.test(txt)) {
      const h = T().estado.sitio.horario;
      decir(h ? `🕒 ${h}` : "Escríbenos por WhatsApp y te confirmamos la hora de entrega.");
      return ofrecer([chipPersona(), volverAlMenu]);
    }
    if (/domicilio|envio|entrega|llevan|direccion|donde|ubicacion|llegar|queda|recoger/.test(txt)) return domicilio();
    if (/hay|disponib|stock|tienen|quedan|agotad/.test(txt)) return disponibilidad();
    if (/precio|cuanto|cuesta|vale|valor|barato|costo/.test(txt)) return precios();
    if (/recomiend|tamano|conviene|mejor|cual|grande|pequen|elegir/.test(txt)) return preguntarUso();
    if (/pedido|carrito|total/.test(txt)) return verPedido();
    if (/comprar|quiero|pedir|necesito|encargar/.test(txt)) {
      decir("¡Claro! Dime el tipo y la cantidad, por ejemplo: **2 cubetas AA** o **1 cartón tipo A**.",
            "O si prefieres, te ayudo a elegir.");
      return ofrecer([{ texto: "¿Qué tamaño me conviene?", accion: preguntarUso }, { texto: "¿Qué hay disponible?", accion: disponibilidad }]);
    }

    decir("No te entendí del todo 🤔. Puedes escribir, por ejemplo, **2 cubetas AA**, **¿cuánto vale?** o **¿hacen domicilio?**");
    ofrecer([
      { texto: "¿Qué tamaño me conviene?", accion: preguntarUso },
      { texto: "Precios", accion: precios },
      chipPersona(),
    ]);
  }

  // -------------------------------------------------------------
  // Montaje
  // -------------------------------------------------------------
  function abrir() {
    burbuja.hidden = true;
    panel.hidden = false;
    lanzador.setAttribute("aria-expanded", "true");
    if (!iniciado) {
      iniciado = true;
      menu(true);
    }
    setTimeout(() => entrada.focus(), 50);
  }

  function cerrar() {
    panel.hidden = true;
    lanzador.setAttribute("aria-expanded", "false");
    lanzador.focus({ preventScroll: true });
  }

  function montar() {
    lanzador = crear("button", "chat-lanzador");
    lanzador.type = "button";
    lanzador.setAttribute("aria-label", "Abrir asistente de ventas");
    lanzador.setAttribute("aria-expanded", "false");
    lanzador.setAttribute("aria-controls", "chat-panel");
    lanzador.append(crear("span", "", "💬"), crear("span", "chat-lanzador-texto", "¿Te ayudo?"));

    burbuja = crear("button", "chat-burbuja", "¿Buscas huevos? Te ayudo a elegir 🥚");
    burbuja.type = "button";
    burbuja.hidden = true;

    panel = crear("section", "chat-panel");
    panel.id = "chat-panel";
    panel.hidden = true;
    panel.setAttribute("aria-label", "Asistente de ventas");

    const cabecera = crear("header", "chat-cabecera");
    const titulo = crear("div");
    titulo.append(crear("strong", "", T().estado.sitio.nombre), crear("span", "chat-estado", "Asistente de pedidos"));
    const cerrarBtn = crear("button", "boton-icono", "×");
    cerrarBtn.type = "button";
    cerrarBtn.setAttribute("aria-label", "Cerrar asistente");
    cabecera.append(titulo, cerrarBtn);

    mensajes = crear("div", "chat-mensajes");
    mensajes.setAttribute("role", "log");
    mensajes.setAttribute("aria-live", "polite");
    opciones = crear("div", "chat-opciones");

    const form = crear("form", "chat-form");
    entrada = crear("input");
    entrada.placeholder = "Escribe, por ejemplo: 2 cubetas AA";
    entrada.setAttribute("aria-label", "Mensaje para el asistente");
    entrada.maxLength = 120;
    entrada.autocomplete = "off";
    const enviar = crear("button", "boton boton-principal", "Enviar");
    enviar.type = "submit";
    form.append(entrada, enviar);

    panel.append(cabecera, mensajes, opciones, form);
    document.body.append(panel, burbuja, lanzador);

    lanzador.addEventListener("click", () => (panel.hidden ? abrir() : cerrar()));
    burbuja.addEventListener("click", abrir);
    cerrarBtn.addEventListener("click", cerrar);
    panel.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const texto = entrada.value.trim();
      if (!texto) return;
      entrada.value = "";
      decirUsuario(texto);
      responderTexto(texto);
    });

    // Invitación discreta, una vez por visita.
    let visto = false;
    try { visto = sessionStorage.getItem(CLAVE_SALUDO) === "1"; } catch (e) {}
    if (!visto) {
      setTimeout(() => {
        if (panel.hidden) burbuja.hidden = false;
        try { sessionStorage.setItem(CLAVE_SALUDO, "1"); } catch (e) {}
      }, 8000);
    }
  }

  document.addEventListener("tienda:lista", montar, { once: true });
})();
