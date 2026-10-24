// Galería de fotos de la granja (fotos.json, generado con
// herramientas/optimizar_fotos.py). La sección se muestra solo si hay fotos.

(() => {
  const $ = (sel) => document.querySelector(sel);
  const TEXTO_POR_DEFECTO = "Gallinas de nuestra granja";
  let fotos = [];
  let actual = 0;

  function mostrar(indice) {
    actual = (indice + fotos.length) % fotos.length;
    const f = fotos[actual];
    const img = $("#visor-imagen");
    img.src = f.grande;
    img.alt = f.texto || TEXTO_POR_DEFECTO;
    img.width = f.ancho;
    img.height = f.alto;
    $("#visor-texto").textContent = f.texto || "";
    $("#visor-texto").hidden = !f.texto;
  }

  function pintar() {
    const cont = $("#galeria");
    cont.replaceChildren();
    fotos.forEach((f, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "galeria-item";
      b.setAttribute("aria-label", `Ampliar foto: ${f.texto || TEXTO_POR_DEFECTO}`);
      const img = document.createElement("img");
      img.src = f.miniatura;
      img.alt = f.texto || TEXTO_POR_DEFECTO;
      img.loading = "lazy";
      img.decoding = "async";
      if (f.ancho && f.alto) {
        img.width = f.ancho;
        img.height = f.alto;
      }
      b.append(img);
      b.addEventListener("click", () => {
        mostrar(i);
        $("#visor").showModal();
      });
      cont.append(b);
    });
  }

  function prepararVisor() {
    const visor = $("#visor");
    $("#visor-cerrar").addEventListener("click", () => visor.close());
    $("#visor-anterior").addEventListener("click", () => mostrar(actual - 1));
    $("#visor-siguiente").addEventListener("click", () => mostrar(actual + 1));
    // Clic fuera de la foto cierra el visor.
    visor.addEventListener("click", (e) => { if (e.target === visor) visor.close(); });
    visor.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") mostrar(actual - 1);
      if (e.key === "ArrowRight") mostrar(actual + 1);
    });
    // Deslizar con el dedo en el celular.
    let inicioX = null;
    visor.addEventListener("touchstart", (e) => { inicioX = e.touches[0].clientX; }, { passive: true });
    visor.addEventListener("touchend", (e) => {
      if (inicioX === null) return;
      const dx = e.changedTouches[0].clientX - inicioX;
      if (Math.abs(dx) > 50) mostrar(actual + (dx < 0 ? 1 : -1));
      inicioX = null;
    });
    if (fotos.length < 2) {
      $("#visor-anterior").hidden = true;
      $("#visor-siguiente").hidden = true;
    }
  }

  async function iniciar() {
    try {
      const r = await fetch("fotos.json", { cache: "no-store" });
      if (!r.ok) return;
      fotos = ((await r.json()).fotos || []).filter((f) => f.grande && f.miniatura);
    } catch (e) {
      return;
    }
    if (!fotos.length) return;
    pintar();
    prepararVisor();
    $("#granja").hidden = false;
    $("#menu-granja").hidden = false;
  }

  iniciar();
})();
