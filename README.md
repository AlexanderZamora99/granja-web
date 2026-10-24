# Página web de clientes

Sitio estático (HTML, CSS y JavaScript, sin servidor) publicado gratis con GitHub Pages.

| Archivo | Qué contiene | Cómo se cambia |
| --- | --- | --- |
| `sitio.json` | Nombre, WhatsApp, ciudad, horario, zona y valor del domicilio | A mano |
| `precios.json` | Categorías, rangos de peso y precios | Desde la app interna: **Precios > Publicar precios en la web** |
| `index.html`, `estilos.css`, `app.js` | Diseño y funcionamiento | Solo si cambias la página |

El número de WhatsApp se escribe con indicativo o como celular colombiano de 10 dígitos (`3001234567`). Mientras esté vacío, el botón de enviar pedido queda desactivado.

## Fotos de la granja

1. Copia las fotos (JPG, PNG o WebP) en una carpeta cualquiera.
2. Desde esta carpeta ejecuta:

   ```powershell
   python herramientas/optimizar_fotos.py "C:\ruta\a\mis\fotos"
   ```

   Crea versiones livianas en `fotos/`, las endereza y les quita los metadatos (modelo del celular, fecha y ubicación GPS). Los originales no se tocan.
3. Opcional: escribe un texto corto para cada foto en `fotos.json` (campo `texto`).
4. Sube los cambios (`git add -A`, `git commit`, `git push`).

La sección "Conoce a nuestras gallinas" aparece sola cuando `fotos.json` tiene al menos una foto.

## Vista previa local

```powershell
python -m http.server 8080
```

Luego abre `http://localhost:8080`.
