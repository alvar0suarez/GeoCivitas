# GEOCIVITAS · Atlas de la Humanidad

Atlas interactivo de la especie humana entre el **50 000 a. C. y el 2200**, pensado
como si se consultara desde el siglo XXII: no un mapa de reyes y batallas, sino un
instrumento para leer a la vez **quién mandaba, cómo se vivía y por qué**.

No hay dependencias, ni build, ni framework. HTML, CSS y JavaScript de módulos ES
sobre un solo `<canvas>`.

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Los módulos ES no funcionan desde `file://`: hay que servir la carpeta por HTTP.

---

## Qué hace

### El color dice qué clase de dominio es

La diferencia entre "conquistar" y "controlar" es el eje del atlas. Cada entidad se
pinta en cuatro intensidades, porque ningún imperio manda igual en todas partes:

| Clase | Qué significa |
|---|---|
| **Núcleo** | Administración directa, fiscalidad propia, reclutamiento fiable |
| **Provincia** | Gobernador nombrado, guarnición, impuesto recaudado con coste |
| **Tributario** *(trama de líneas)* | Élite local intacta a cambio de tributo. Se pierde en cuanto aparece otro postor |
| **Disputado** *(trama diagonal)* | Ocupación no consolidada: frontera activa, revuelta latente o control estacional |

El borde discontinuo marca **escenario prospectivo**, no hecho.

### Antes del estado no hay fronteras, hay presencia

Por debajo del 3000 a. C. la capa **Horizontes** sustituye la soberanía por manchas
difusas: especies humanas coexistiendo, casquetes glaciares, refugios, focos
independientes de domesticación. En los máximos glaciales emerge además la
**plataforma continental**: Beringia, Sondalandia, Sahul, Doggerland y el valle del
Golfo Pérsico, tierra firme cuando el mar estaba 125 m más abajo.

### Doce capas temáticas sobre la condición humana

Población, renta, esperanza de vida, mortalidad infantil, ingesta diaria,
rendimiento cerealista, urbanización, alfabetización, muerte violenta, población no
libre, jornada anual y energía por persona — más un **Índice de Condición Humana**
compuesto que resume siete de ellas en una cifra comparable entre épocas.

Es la respuesta a la pregunta que el mapa político nunca contesta: *y a la gente,
¿cómo le iba?*

### Choques

33 catástrofes fechadas y situadas: sequías (evento 4.2 ka, colapso del Bronce,
Terminal Clásico maya), pestes (Antonina, Justiniano, Peste Negra, colapso
americano, 1918, COVID), erupciones (Thera, Samalas, Tambora), hambrunas y
anomalías climáticas (el velo de polvo del 536, la Pequeña Edad de Hielo).

### Umbral tecnomilitar

36 innovaciones desde el arco (45 000 a. C.) hasta escenarios del siglo XXII, cada
una con su foco documentado y su curva de difusión. No son adorno: alimentan el
simulador con coeficientes de proyección, letalidad, movilidad, logística,
fortificación y umbral de adopción.

### Motor de conquista

Elige atacante, año y objetivo —otro estado o un punto cualquiera del mapa— y
estima si la empresa era sostenible, combinando:

- **Gradiente de pérdida de fuerza** (Boulding, 1962): la potencia decae con la
  distancia al centro de poder.
- **Fricción del terreno**: montaña, aridez, selva y mar multiplican kilómetros en
  vez de sumarlos; el corredor se muestrea sobre el círculo máximo.
- **Ley de Lanchester**: con armas de alcance la ventaja numérica rinde de forma
  cuadrática.
- **Tecnología disponible ahí y entonces**, con retardo por distancia al foco.
- **Choques activos** sobre atacante y defensor.

Devuelve probabilidad, **clase de control sostenible**, vida media del dominio,
duración y coste anual de ocupación — con la descomposición de factores a la vista.

---

## Estructura

```
index.html
styles/app.css
src/
  core/proyeccion.js   ortográfica y equirectangular; recorte de horizonte y antimeridiano
  core/escala.js       escala temporal por tramos (52 200 años en una barra)
  core/series.js       interpolación, rampas de color, formato
  core/datos.js        carga, indexación y consultas por año
  render/atlas.js      renderizador por capas sobre un único canvas
  sim/conquista.js     motor de conquista
  ui/                  panel, regla temporal, simulador
  main.js              estado, interacción, bucle
data/
  world.json           costas y países (Natural Earth 110m, precisión 0,01°)
  polities.json        35 entidades políticas con zonas de control
  prehistory.json      horizontes profundos, nivel del mar, plataformas
  humanidad.json       serie global + desviaciones regionales
  shocks.json          catástrofes
  weapons.json         umbrales tecnomilitares
  geografia.json       cordilleras, áridas, selvas, pasos, rutas
  ciudades.json        66 centros urbanos con series de población
  eventos.json         hitos institucionales y de conocimiento
tools/build-geo.mjs    convierte los TopoJSON de world-atlas al formato compacto
```

### Regenerar la base cartográfica

```bash
curl -O https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json
curl -O https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json
node tools/build-geo.mjs .
```

---

## Dos decisiones que conviene conocer

**La escala temporal no es lineal.** Con 52 200 años repartidos linealmente, el
Paleolítico se comería el 95 % de la barra. La escala es por tramos, con densidad
creciente hacia el presente: un siglo reciente ocupa tanto como diez milenios
profundos.

**Las extensiones son estilizadas.** Cada instantánea se compone uniendo geometría
moderna y recortándola con cajas de control. Eso da costas fieles y comparaciones
útiles a escala continental, pero **no sirve para arbitrar fronteras**: ni la
resolución ni el método lo permiten.

---

## Honestidad de los datos

- Las series preindustriales son **órdenes de magnitud** reconstruidos a partir de
  los rangos aceptados en Maddison (renta), HYDE (población), Riley y Gapminder
  (salud), FAO (nutrición y rendimiento) y la literatura sobre violencia histórica.
  No son mediciones.
- De las métricas regionales sólo tres están ancladas en datos (peso demográfico,
  renta y salud relativas); el resto se deriva de ellas con elasticidades fijas y
  documentadas en `src/core/datos.js`. Es una textura razonada, no una observación.
- El **Índice de Condición Humana** es una lente construida por esta aplicación, no
  una estadística oficial.
- Las cifras de muertes en catástrofes son estimaciones centrales de rangos a veces
  muy amplios.
- **Todo lo posterior a 2030 es escenario**, va marcado en magenta con la etiqueta
  correspondiente y no debe leerse como predicción.

## Controles

| | |
|---|---|
| Arrastrar | Girar el globo o desplazar el mapa |
| Rueda · ↑↓ | Acercar y alejar |
| Clic | Abrir el expediente de lo que haya bajo el cursor |
| Espacio | Reproducir la línea del tiempo |
| ← → | Avanzar por pasos (con Mayús, saltos largos) |
| S · R · P | Simulador · salto aleatorio · panel |
| ? | Guía |

## Créditos

Geometría base: [Natural Earth](https://www.naturalearthdata.com/) (dominio
público) vía [world-atlas](https://github.com/topojson/world-atlas), simplificada a
110 m y reprocesada a un formato plano propio.
