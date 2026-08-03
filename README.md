# GEOCIVITAS · Atlas de la Humanidad

Atlas interactivo de la especie humana entre el **50 000 a. C. y el 2200**, pensado
como si se consultara desde el siglo XXII: no un mapa de reyes y batallas, sino un
instrumento para leer a la vez **quién mandaba, cómo se vivía y por qué**.

**En línea:** https://alvar0suarez.github.io/GeoCivitas/

No hay dependencias, ni build, ni framework. HTML, CSS y JavaScript de módulos ES
sobre un solo `<canvas>`.

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

Los módulos ES no funcionan desde `file://`: hay que servir la carpeta por HTTP.

---

## Qué hace

### El color dice hasta dónde manda de verdad

La diferencia entre "conquistar" y "controlar" es el eje del atlas. Cada entidad se
descompone en **zonas nombradas** —provincias, marcas, reinos clientes— y cada zona
lleva su grado de control, con un índice de 0 a 100 que mide cuánto de lo que el
centro ordena llega a ejecutarse sobre el terreno:

| Clase | Índice | Qué significa |
|---|---|---|
| **Núcleo** | 92 | Administración directa, fiscalidad propia, reclutamiento fiable |
| **Provincia** | 74 | Gobernador nombrado, guarnición permanente, impuesto recaudado con coste |
| **Marca** *(trama de puntos)* | 56 | Franja militarizada bajo mando fronterizo: se sostiene con guarnición, no con administración |
| **Cliente** *(retícula)* | 40 | Dinastía local reconocida por el centro, que controla su exterior y le deja el interior |
| **Tributario** *(trama de líneas)* | 27 | Élite local intacta a cambio de tributo. Se pierde en cuanto aparece otro postor |
| **Disputado** *(trama diagonal)* | 14 | Ocupación no consolidada: frontera activa, revuelta latente o control estacional |
| **Influencia** *(punteado difuso)* | 8 | Sin administración ni guarnición: hegemonía comercial, naval o diplomática |

El borde discontinuo marca **escenario prospectivo**, no hecho.

Cada zona guarda además cómo se adquirió (conquista, herencia, matrimonio, tratado,
sumisión, colonización, federación, concesión), en qué año, su guarnición estimada,
su parte del erario y su riesgo anual de revuelta. Son estimaciones razonadas sobre
bibliografía estándar, no mediciones, y el atlas lo dice donde las muestra.

### La frontera se mueve con cada año

El atlas guarda instantáneas fechadas, pero no las muestra a saltos: entre dos
fotos consecutivas las zonas se emparejan —por nombre, y si el nombre cambió,
por territorio compartido— y se mezclan. Las cajas y polígonos de recorte se
desplazan punto a punto, los países que entran o salen del imperio lo hacen con
un peso que va de 0 a 1, y el grado de control recorre su índice en vez de
saltar de golpe. Mover la línea del tiempo un año mueve la frontera un año.

Cuando una zona sabe la fecha exacta en que se ganó o se perdió (`desde`,
`hasta`), no se desvanece: aparece o desaparece ese año. Sicilia se pierde en
241 a. C., no gradualmente entre el 264 y el 218.

La Reconquista es el caso que mejor lo enseña. Al-Ándalus pasa de 0,40 M km² en
756 a 1,12 en el año 1000 con Almanzor, se hunde a 0,33 en 1031 con las taifas,
0,27 en 1150, 0,11 tras Las Navas y 0,03 cuando sólo queda Granada. Ocho
snapshots, ochocientos años de línea bajando.

Son **221 instantáneas** para 76 entidades. Ninguna entidad supera los 250 años
sin recalcular y la mediana del mayor hueco por entidad está en 156 años; en los
periodos con más registro, en décadas.

Donde la frontera es un río y no un paralelo, se traza como tal. **375 zonas**
—el 62 % del total— se recortan con polígonos sobre las líneas que de verdad
organizaron el territorio:

- **Iberia**: el Duero, el Tajo, el Ebro y Sierra Morena
- **Limes romano**: el Rin, el Danubio y el muro de Adriano
- **China**: el Huai, el Yangtsé, el corredor de Hexi y la Gran Muralla
- **India**: el Ganges, el Indo, Malwa, Rajputana y el Decán
- **Anatolia y Mesopotamia**: el Tauro y el Éufrates
- **África**: la curva del Níger, la cuenca del Chad, el altiplano etíope, la
  franja mediterránea del Magreb y la meseta entre el Zambeze y el Limpopo
- **América**: los Andes de Quito al Maule —una tira de cinco mil kilómetros
  entre el Pacífico y la selva—, la cuenca de México y el Petén maya
- **Sudeste asiático**: el delta del río Rojo, el Tonlé Sap, el Chao Phraya,
  el estrecho de Malaca y el eje Java-Sumatra
- **Rusia y la estepa**: la cuenca del Volga, la estepa póntica del Danubio al
  Irtish, el Turkestán y Siberia
- **Europa central**: el Sacro Imperio del Elba al Po, la Mancomunidad
  polaco-lituana, el Báltico sueco y los ocho pedazos del imperio carolingio

Quedan cajas donde la costa ya hace de recorte y la diferencia no se ve.

Las superficies se miden por intersección real entre el recorte y el territorio
de los países miembros, contando celdas de medio grado. El mínimo entre ambas
cifras, que es lo que se usaba antes, contaba el Sáhara entero como provincia
romana.

### Mando efectivo: comparar imperios sin memorizar colores

La capa **Mando efectivo** deja de colorear por identidad y colorea por solidez: la
misma rampa para todos, del rojo (una orden que nadie obedece) al verde (una que se
ejecuta sola). El expediente de cada entidad reparte su extensión en una barra
apilada y la resume en un número.

Sirve para ver que dos manchas del mismo tamaño pueden ser dos animales distintos:
Roma en 117 sale en **65**, con dos tercios de su superficie en provincias
administradas; el imperio mongol de 1279, con más del doble de extensión, sale en
**51** porque más de la mitad son kanatos que ya no obedecen a nadie; el británico
de 1920 sale en **47** porque el 58 % son dominios que firmaron Versalles por su
cuenta.

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

### Batallas decisivas

50 encuentros entre Meguido (1457 a. C.) y la defensa de Kiev (2022), con
contendientes, efectivos estimados, tipo (terrestre, naval, asedio), peso
histórico y —lo que importa— por qué el mapa dejó de funcionar igual después.

### Invenciones

60 hitos técnicos civiles: del control del fuego a los modelos generalistas,
pasando por la aguja de coser que hizo habitable Siberia, el cero posicional, la
contabilidad por partida doble y el contenedor normalizado. Cada uno con foco,
campo, impacto y curva de difusión.

### Lenguas

12 familias lingüísticas con su patria reconstruida y sus etapas de expansión
—indoeuropea, bantú, austronesia, túrquica, esquimo-aleutiana…— más las siete
hipótesis principales sobre **el origen del lenguaje**, desde el salto único de
Chomsky al acicalamiento vocal de Dunbar.

### Gobierno

Reparto de la humanidad por régimen político a lo largo del tiempo, de las
bandas igualitarias a la democracia de sufragio universal, con 26 hitos de
arquitectura institucional. El dato que suele sorprender: la democracia de
sufragio universal no existe en ningún lugar del mundo antes de 1893.

### Buscador

`/` abre un buscador sobre todo el Archivo —entidades, batallas, invenciones,
umbrales militares, catástrofes, hitos, instituciones, lenguas, rutas, pasos,
regiones y ciudades—. Insensible a acentos, con salto directo al año y al lugar.

### Aparato crítico

Un mapa histórico sin procedencia es una ilustración. La pestaña **Fuentes**
declara, para cada registro, **cuánto conviene fiarse** —alta, media, baja o
escenario, con el motivo—, recoge **57 obras** con lo que se usa de cada una, y
abre **11 controversias** donde la disciplina no se ha puesto de acuerdo: la
magnitud real de la peste de Justiniano, la patria del indoeuropeo, la población
americana de 1492, la Gran Divergencia, la violencia prehistórica…

Cuando un dato del atlas está discutido, su ficha lo dice y enlaza a las
posiciones enfrentadas. Que un dato esté en disputa no es un defecto del atlas:
es información sobre el dato.

### Citar una vista

Todo el estado —año, encuadre, capas, temática y selección— vive en el fragmento
de la URL. `L` copia el enlace a la vista exacta que estés viendo; `E` exporta un
expediente en Markdown con la serie global, las entidades activas, los choques en
curso, la tabla regional y la bibliografía completa.

### Analista del Archivo

Un panel de preguntas en lenguaje natural que **no responde de memoria**: recibe
los registros concretos del año seleccionado —entidades, regiones, choques,
batallas, invenciones, hitos, avisos de procedencia y debates abiertos— y se le
exige ceñirse a ellos, marcar explícitamente lo que quede fuera del Archivo y
señalar lo que esté en discusión. Bajo cada respuesta se enseña qué se le pasó.

Requiere credenciales, así que sólo funciona donde se configuren:

- **Proxy propio** (recomendado): la clave vive en el servidor. En
  `tools/proxy-ejemplo.js` hay uno completo para Cloudflare Workers, con lista de
  orígenes, modelos permitidos y techo de gasto por petición.
- **Clave en el navegador**: sólo para uso personal. Queda expuesta a cualquier
  script de la página y no se puede limitar.

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
  polities.json        76 entidades políticas con zonas de control
  prehistory.json      horizontes profundos, nivel del mar, plataformas
  humanidad.json       serie global + desviaciones regionales
  shocks.json          catástrofes
  weapons.json         umbrales tecnomilitares
  geografia.json       cordilleras, áridas, selvas, pasos, rutas
  ciudades.json        66 centros urbanos con series de población
  eventos.json         hitos institucionales y de conocimiento
  batallas.json        50 encuentros decisivos
  inventos.json        60 invenciones civiles
  lenguas.json         familias lingüísticas y origen del lenguaje
  politica.json        regímenes de gobierno e instituciones
  fuentes.json         confianza, bibliografía y controversias
styles/fonts.css       tipografías incrustadas (generado)
tools/
  build-geo.mjs        convierte los TopoJSON de world-atlas al formato compacto
  build-fonts.mjs      incrusta las tipografías como data URI
  build-artifact.mjs   empaqueta todo en un único HTML autocontenido
  validar-datos.mjs    integridad referencial del Archivo
  proxy-ejemplo.js     proxy de la API para el Analista (Cloudflare Workers)
.github/workflows/
  pages.yml            valida los datos y publica en GitHub Pages
```

### Publicación

Cada `push` a `main` valida el Archivo y, si no hay errores, despliega el
repositorio tal cual en GitHub Pages. No hay paso de compilación: el sitio *es*
el repositorio.

**Activación, una sola vez:** en *Settings → Pages*, elegir **GitHub Actions**
como origen. El token del flujo de trabajo puede desplegar en un sitio existente
pero no crearlo, así que hasta ese clic el despliegue falla con
`Resource not accessible by integration`.

### Validar

```bash
node tools/validar-datos.mjs
```

El renderizador es tolerante: un país mal escrito no rompe nada, simplemente no
se pinta — lo que convierte una errata en un error invisible. El validador
comprueba nombres de país, orden y rango de las series, coordenadas, cajas
invertidas e identificadores repetidos, y distingue el error real del aviso
esperable (Malta, Singapur o Maldivas no tienen geometría a 110 m).

### Empaquetar en un solo archivo

```bash
npm i esbuild @fontsource/ibm-plex-mono @fontsource/archivo
node tools/build-fonts.mjs .
node tools/build-artifact.mjs dist/geocivitas.html
```

Produce un HTML de ~590 KB que se abre sin servidor: el Archivo va incrustado
como `window.__GEO_DATA` y las tipografías como data URI, porque una fuente
enlazada a un CDN falla en silencio allí donde hay política de contenido
estricta y deja la página con la tipografía de sistema.

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
| / | Buscar en todo el Archivo |
| L · E | Copiar enlace a esta vista · exportar expediente |
| S · R · P | Simulador · salto aleatorio · panel |
| ? | Guía |

## Créditos

Geometría base: [Natural Earth](https://www.naturalearthdata.com/) (dominio
público) vía [world-atlas](https://github.com/topojson/world-atlas), simplificada a
110 m y reprocesada a un formato plano propio.

Tipografías: **IBM Plex Mono** (IBM) y **Archivo** (Omnibus-Type), ambas bajo
SIL Open Font License 1.1, incrustadas en subconjunto latino.
