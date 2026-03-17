# Optimizador de cortes (vidrio y espejo)

Aplicación web estática (sin dependencias) para:

- Ingresar piezas (ancho, alto, cantidad) en **cm**
- Seleccionar un tipo de lámina con **medidas y precio**
- Distribuir automáticamente las piezas dentro de la(s) lámina(s) con un **plano técnico (SVG)**
- Calcular **área usada**, **desperdicio**, **costo de material** (prorrateado por área), **costo por pieza**
- Agregar costos adicionales: transporte, silicona (unidad x cantidad), viselado, arenado, cinta LED (metro x metros), botón touch (unidad x cantidad) y mano de obra (%)

## Ejecutar

Desde esta carpeta:

```bash
python3 -m http.server 8000
```

Luego abre `http://localhost:8000` en el navegador.

## APK (Android)

Este proyecto incluye una app Android generada con **Capacitor** (carpeta `android/`) que empaqueta la versión web (carpeta `public/`) para instalarla como APK.

### Opcion A: Android Studio (recomendado)

1. Instala Android Studio
2. Abre la carpeta `android/` como proyecto
3. Espera a que descargue el SDK/Gradle si lo pide
4. Ve a `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`

El APK (debug) queda normalmente en `android/app/build/outputs/apk/debug/`.

### Opcion B: comando (si ya tienes SDK)

```bash
npm run cap:sync
cd android
./gradlew assembleDebug
```

## Notas

- El anidado usa un heurístico tipo **MaxRects** (no garantiza óptimo global, pero funciona bien para cotización rápida).
- El costo de material se calcula prorrateado por **cm²**; también se muestra el valor de **lámina completa** como referencia.
