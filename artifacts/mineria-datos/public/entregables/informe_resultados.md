# Informe de laboratorio — Minería de datos

## Objetivo y metodología

Se aplicó CRISP-DM a tres conjuntos cuantitativos. Se revisó la estructura y calidad, se normalizaron encabezados y números, se imputaron predictores faltantes con mediana, se eliminaron filas sin objetivo válido y duplicados exactos. Los valores atípicos se detectaron con IQR (1,5×) y se conservaron porque ser extremos no demuestra que sean errores.

Los modelos son regresiones lineales múltiples. El desempeño se estimó en un conjunto de prueba separado (20 %, semilla fija 42); después cada modelo final se ajustó con todas las filas válidas y se exportó con joblib. En energía, la hora se codificó con seno y coseno para representar su naturaleza cíclica.

## Resultados por ejercicio

### Precio del dólar

- Filas: 500 originales; 500 conservadas.
- Limpieza: 0 filas descartadas por objetivo inválido, 0 duplicadas, 0 celdas faltantes, 0 imputaciones.
- Atípicos: 10 filas marcadas (11 valores); no se eliminaron.
- Evaluación: MSE = 2640.062020; RMSE = 51.381534; R² = 0.994875 (prueba n=100).
- Mayor impacto estandarizado: Día (0.9978).

| Término | Coeficiente | Impacto estandarizado |
|---|---:|---:|
| Día | 4.999060 | 0.997760 |
| Inflación | -338.059761 | -0.002291 |
| Tasa de interés | -2.532823 | -0.001711 |

### Nivel de glucosa

- Filas: 2000 originales; 2000 conservadas.
- Limpieza: 0 filas descartadas por objetivo inválido, 0 duplicadas, 0 celdas faltantes, 0 imputaciones.
- Atípicos: 19 filas marcadas (19 valores); no se eliminaron.
- Evaluación: MSE = 244.512658; RMSE = 15.636901; R² = 0.677319 (prueba n=400).
- Mayor impacto estandarizado: Edad (0.7916).

| Término | Coeficiente | Impacto estandarizado |
|---|---:|---:|
| Edad | 1.233681 | 0.791587 |
| IMC | 0.883236 | 0.128678 |
| Actividad física | -2.010386 | -0.214122 |

### Consumo de energía

- Filas: 10000 originales; 10000 conservadas.
- Limpieza: 0 filas descartadas por objetivo inválido, 0 duplicadas, 0 celdas faltantes, 0 imputaciones.
- Atípicos: 133 filas marcadas (156 valores); no se eliminaron.
- Evaluación: MSE = 864.262934; RMSE = 29.398349; R² = 0.787608 (prueba n=2000).
- Mayor impacto estandarizado: Temperatura (0.7745).

| Término | Coeficiente | Impacto estandarizado |
|---|---:|---:|
| Temperatura | 9.878153 | 0.774467 |
| Hora · seno | -37.954613 | -0.420495 |
| Hora · coseno | 5.426012 | 0.060119 |
| Día de la semana | -3.089832 | -0.096824 |

## Conclusiones

El mayor R² en los datos de prueba fue el de **Precio del dólar** (R² = 0.9949). El impacto relativo se comparó con coeficientes estandarizados, no con los coeficientes brutos, porque las variables usan unidades distintas. Estos resultados describen los CSV entregados; no establecen causalidad y su capacidad predictiva depende de que los datos futuros mantengan patrones similares.

Los archivos `.joblib` deben cargarse únicamente si se confía en su origen: joblib utiliza serialización pickle y no es seguro abrir archivos de terceros.

## Reproducción

Instalar `pandas`, `scikit-learn` y `joblib`, y ejecutar `python train_models.py`. El script vuelve a limpiar, entrenar, evaluar, exportar los modelos y generar este informe y los CSV limpios.
