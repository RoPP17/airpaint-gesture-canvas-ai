# 🖐️ AirPaint — Lienzo de Dibujo Aéreo por Gestos con IA (MediaPipe)

[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)
[![MediaPipe](https://img.shields.io/badge/AI%20Vision-MediaPipe%20Hands-0097A7?style=for-the-badge&logo=google&logoColor=white)](https://developers.google.com/mediapipe)
[![HTML5 Canvas](https://img.shields.io/badge/Graphics-HTML5%20Canvas%20%2F%20WebGL-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/es/docs/Web/API/Canvas_API)
[![Python Server](https://img.shields.io/badge/Server-Python%20HTTP-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

> **Aplicación web interactiva de Visión por Computadora e Interacción Humano-Computadora (HCI)** que utiliza Inteligencia Artificial (**MediaPipe Hands**) para rastrear la cinemática de la mano en tiempo real mediante la cámara web, permitiendo pintar en el aire con efectos neón, manipular formas geométricas y controlar herramientas mediante un menú holográfico contextual.

---

## 🚀 Características Principales

* **🎨 Trazo Aéreo con Resplandor Neón:** Renderizado fluido sobre HTML5 Canvas con suavizado geométrico continuo en tiempo real.
* **✌️ Menú Radial Holográfico Flotante:** Al hacer el gesto de la paz (`✌️`), se despliega un menú circular interactivo centrado en la palma de la mano:
  * **Arriba:** Herramienta **Lápiz**.
  * **Derecha:** Herramienta **Selección / Arrastrar**.
  * **Abajo:** Herramienta **Borrador**.
  * **Izquierda:** **Limpiar Lienzo** (con temporizador de confirmación).
* **👌 Manipulación Directa por Gesto "Pinch":** Unión de los dedos índice y pulgar para iniciar el trazo, escalar figuras geométricas (rectángulos y elipses) o arrastrar elementos dibujados.
* **📉 Filtro de Paso Bajo Adaptativo (Anti-Jitter):** Filtro matemático exponencial adaptativo que atenúa el temblor natural de la mano y el ruido de detección de la cámara sin introducir latencia perceptible.
* **↩️ Historial Completo (Undo / Redo):** Pila de estados interactiva accesible por atajos de teclado (`Ctrl+Z` / `Ctrl+Y`).
* **💾 Exportación en Alta Resolución:** Descarga de obras directamente en formato PNG transparente o con fondo de estudio oscuro.

---

## 🫵 Mapeo de Gestos y Cinemática Manual

| Gesto | Estado de la Mano | Acción en Pantalla |
|:---:|:---|:---|
| 🖐️ | **Mano Abierta** | Modo puntero libre / Desplazamiento sin pintar |
| 👌 | **Pinch (Pulgar + Índice)** | Dibujar trazo continuo, generar figura o mover objeto |
| ✌️ | **Gesto de la Paz** | Desplegar menú circular holográfico contextual |
| 👆 | **Selección en Menú** | Mover el dedo índice hacia un cuadrante para cambiar herramienta |

---

## 💻 Inicio Rápido

### Requisitos:
* Navegador moderno (Chrome, Brave, Edge o Firefox).
* Cámara web funcional.
* Python 3.8+ (para el servidor local).

### Ejecución:
1. Clona el repositorio:
   ```bash
   git clone https://github.com/RoPP17/airpaint-gesture-canvas-ai.git
   cd airpaint-gesture-canvas-ai
   ```
2. Inicia el servidor local:
   ```bash
   python serve.py
   ```
3. El script abrirá automáticamente tu navegador en `http://localhost:8080`. Concede permisos de cámara web y empieza a dibujar en el aire.

---

## 👨‍💻 Autor

* **Roberto Andrés Pepe Sánchez** — [GitHub: @RoPP17](https://github.com/RoPP17)

## 📜 Licencia

Este proyecto está bajo la Licencia [MIT](LICENSE).
