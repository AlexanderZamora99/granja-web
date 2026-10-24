# Página web de clientes

Sitio estático (HTML, CSS y JavaScript, sin servidor) publicado gratis con GitHub Pages.

| Archivo | Qué contiene | Cómo se cambia |
| --- | --- | --- |
| `sitio.json` | Nombre, WhatsApp, ciudad, horario, zona y valor del domicilio | A mano |
| `precios.json` | Categorías, rangos de peso y precios | Desde la app interna: **Precios > Publicar precios en la web** |
| `index.html`, `estilos.css`, `app.js` | Diseño y funcionamiento | Solo si cambias la página |

El número de WhatsApp se escribe con indicativo o como celular colombiano de 10 dígitos (`3001234567`). Mientras esté vacío, el botón de enviar pedido queda desactivado.

## Vista previa local

```powershell
python -m http.server 8080
```

Luego abre `http://localhost:8080`.
