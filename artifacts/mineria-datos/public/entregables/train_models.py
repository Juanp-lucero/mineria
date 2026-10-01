#!/usr/bin/env python3
"""Limpia los tres CSV, evalúa modelos lineales y exporta artefactos joblib.

Uso:
    python train_models.py

Dependencias:
    pip install pandas scikit-learn joblib

Los CSV se leen desde ./datasets y los modelos, conjuntos limpios y el informe
se escriben en las carpetas models/, datasets/limpios/ e informe_resultados.md.
"""

from __future__ import annotations

import math
import re
import unicodedata
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score


ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "datasets"
MODEL_DIR = ROOT / "models"
CLEAN_DIR = DATA_DIR / "limpios"
MODEL_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_DIR.mkdir(parents=True, exist_ok=True)

EXERCISES = {
    "dolar": {
        "title": "Precio del dólar",
        "file": "dolar_data.csv",
        "features": ["Dia", "Inflacion", "Tasa_interes"],
        "target": "Precio_Dolar",
        "target_label": "Precio del dólar",
        "unit": "COP",
        "feature_labels": ["Día", "Inflación", "Tasa de interés"],
        "feature_units": ["día", "proporción", "puntos"],
        "primary_metric": "MSE",
    },
    "glucosa": {
        "title": "Nivel de glucosa",
        "file": "glucosa_data.csv",
        "features": ["Edad", "IMC", "Actividad_Fisica"],
        "target": "Nivel_Glucosa",
        "target_label": "Nivel de glucosa",
        "unit": "mg/dL",
        "feature_labels": ["Edad", "IMC", "Actividad física"],
        "feature_units": ["años", "kg/m²", "horas/semana"],
        "primary_metric": "MSE",
    },
    "energia": {
        "title": "Consumo de energía",
        "file": "energia_data.csv",
        "features": ["Temperatura", "Hora", "Dia_Semana"],
        "target": "Consumo_Energia",
        "target_label": "Consumo de energía",
        "unit": "kWh",
        "feature_labels": ["Temperatura", "Hora", "Día de la semana"],
        "feature_units": ["°C", "hora", "día (1–7)"],
        "primary_metric": "RMSE",
    },
}

ALIASES = {
    "Dia": ["dia", "day", "numero de dia"],
    "Inflacion": ["inflacion", "inflation"],
    "Tasa_interes": ["tasa interes", "interest rate"],
    "Precio_Dolar": ["precio dolar", "dollar price", "exchange rate"],
    "Edad": ["edad", "age"],
    "IMC": ["imc", "bmi", "indice de masa corporal"],
    "Actividad_Fisica": ["actividad fisica", "physical activity"],
    "Nivel_Glucosa": ["nivel glucosa", "glucose", "blood glucose"],
    "Temperatura": ["temperatura", "temperature", "temp"],
    "Hora": ["hora", "hour"],
    "Dia_Semana": ["dia semana", "day of week", "weekday"],
    "Consumo_Energia": ["consumo energia", "energy consumption"],
}


def normalize_header(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9]", "", value.lower())


def number_or_nan(value: object) -> float:
    text = str(value if value is not None else "").strip()
    if text.lower() in {"", "na", "n/a", "null", "none", "nan", "-", "?"}:
        return math.nan
    text = re.sub(r"\s", "", text)
    text = re.sub(r"[^\d,.\-+eE]", "", text)
    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    try:
        result = float(text)
    except ValueError:
        return math.nan
    return result if math.isfinite(result) else math.nan


def valid_feature(key: str, value: float) -> bool:
    if key == "Dia":
        return value.is_integer() and value >= 1
    if key == "Edad":
        return value.is_integer() and 0 <= value <= 120
    if key == "IMC":
        return 0 < value <= 100
    if key == "Actividad_Fisica":
        return 0 <= value <= 168
    if key == "Temperatura":
        return -100 <= value <= 100
    if key == "Hora":
        return 0 <= value <= 24
    if key == "Dia_Semana":
        return value.is_integer() and 1 <= value <= 7
    return True


def valid_target(key: str, value: float) -> bool:
    if key == "Nivel_Glucosa":
        return 20 <= value <= 1000
    return value > 0


def read_and_clean(exercise_id: str, config: dict) -> tuple[pd.DataFrame, dict]:
    raw = pd.read_csv(DATA_DIR / config["file"], dtype=str, encoding="utf-8-sig")
    original_rows = len(raw)
    original_columns = list(raw.columns)
    header_lookup = {normalize_header(column): column for column in original_columns}

    required = config["features"] + [config["target"]]
    mapped_columns: dict[str, str] = {}
    for key in required:
        candidates = [key, *ALIASES.get(key, [])]
        match = next(
            (header_lookup.get(normalize_header(candidate)) for candidate in candidates
             if header_lookup.get(normalize_header(candidate)) is not None),
            None,
        )
        if match is None:
            raise ValueError(
                f"{config['file']}: no se encontró la columna requerida {key!r}."
            )
        mapped_columns[key] = match

    data = pd.DataFrame(
        {key: raw[column].map(number_or_nan) for key, column in mapped_columns.items()}
    )
    missing_values = int(data.isna().sum().sum())
    target = config["target"]
    target_valid = data[target].notna() & data[target].map(
        lambda value: valid_target(target, float(value)) if pd.notna(value) else False
    )
    invalid_rows = int((~target_valid).sum())
    data = data.loc[target_valid].copy()

    invalid_numeric_values = 0
    domain_corrections = 0
    for key in config["features"]:
        invalid_numeric_values += int(data[key].isna().sum())
        if key == "Hora":
            midnight = data[key] == 0
            domain_corrections += int(midnight.sum())
            data.loc[midnight, key] = 24
        invalid_domain = data[key].notna() & ~data[key].map(
            lambda value: valid_feature(key, float(value))
            if pd.notna(value)
            else True
        )
        domain_corrections += int(invalid_domain.sum())
        data.loc[invalid_domain, key] = np.nan

    imputed_values = 0
    for key in config["features"]:
        missing = int(data[key].isna().sum())
        if missing:
            median = float(data[key].median()) if data[key].notna().any() else 0.0
            data.loc[data[key].isna(), key] = median
            imputed_values += missing

    duplicate_rows = int(data.duplicated(subset=required, keep="first").sum())
    data = data.drop_duplicates(subset=required, keep="first").reset_index(drop=True)

    outlier_value_count = 0
    flagged_rows = pd.Series(False, index=data.index)
    for key in required:
        q1 = float(data[key].quantile(0.25, interpolation="linear"))
        q3 = float(data[key].quantile(0.75, interpolation="linear"))
        spread = q3 - q1
        mask = (data[key] < q1 - 1.5 * spread) | (data[key] > q3 + 1.5 * spread)
        outlier_value_count += int(mask.sum())
        flagged_rows |= mask

    data.to_csv(CLEAN_DIR / f"{exercise_id}_limpio.csv", index=False)
    methods = [
        "Normalización de encabezados y lectura de números con punto o coma decimal.",
        "Imputación de predictores faltantes/inválidos con la mediana de la columna.",
        "Eliminación de filas sin objetivo válido y de duplicados exactos.",
        "Atípicos identificados con IQR 1,5×; se conservan y no se eliminan automáticamente.",
        "Evaluación con 80 % de entrenamiento y 20 % de prueba, semilla fija 42.",
    ]
    if invalid_numeric_values:
        methods.append(
            f"{invalid_numeric_values} valores no numéricos de predictores se trataron como faltantes."
        )
    if domain_corrections:
        methods.append(
            f"{domain_corrections} valores fuera de dominio se normalizaron o imputaron."
        )
    report = {
        "inputRows": original_rows,
        "retainedRows": len(data),
        "invalidRows": invalid_rows,
        "duplicateRows": duplicate_rows,
        "missingValues": missing_values,
        "imputedValues": imputed_values,
        "flaggedOutlierRows": int(flagged_rows.sum()),
        "flaggedOutlierValues": outlier_value_count,
        "methods": methods,
    }
    return data, report


def design_matrix(exercise_id: str, values: np.ndarray) -> np.ndarray:
    if exercise_id != "energia":
        return values
    hour = np.where(values[:, 1] == 0, 24, values[:, 1])
    angle = hour / 24.0 * 2.0 * np.pi
    return np.column_stack(
        [values[:, 0], np.sin(angle), np.cos(angle), values[:, 2]]
    )


def seeded_shuffle_indices(size: int) -> list[int]:
    indices = list(range(size))
    seed = 42
    for index in range(size - 1, 0, -1):
        seed = (1664525 * seed + 1013904223) & 0xFFFFFFFF
        swap_index = int((seed / 4294967296) * (index + 1))
        indices[index], indices[swap_index] = indices[swap_index], indices[index]
    return indices


def term_info(exercise_id: str, config: dict) -> list[tuple[str, str, str]]:
    if exercise_id == "energia":
        return [
            ("Temperatura", "Temperatura", "°C"),
            ("Hora · seno", "Hora", "término cíclico"),
            ("Hora · coseno", "Hora", "término cíclico"),
            ("Día de la semana", "Dia_Semana", "día (1–7)"),
        ]
    return list(
        zip(config["feature_labels"], config["features"], config["feature_units"])
    )


def train_one(exercise_id: str, config: dict) -> dict:
    data, cleaning = read_and_clean(exercise_id, config)
    if len(data) < 5:
        raise ValueError(f"{config['file']} necesita al menos cinco filas válidas.")

    values = data[config["features"]].to_numpy(dtype=float)
    target = data[config["target"]].to_numpy(dtype=float)
    matrix = design_matrix(exercise_id, values)
    shuffled = seeded_shuffle_indices(len(data))
    test_count = max(1, math.floor(len(data) * 0.2 + 0.5))
    test_indices = np.asarray(shuffled[:test_count], dtype=int)
    train_indices = np.asarray(shuffled[test_count:], dtype=int)

    holdout = LinearRegression().fit(matrix[train_indices], target[train_indices])
    test_prediction = holdout.predict(matrix[test_indices])
    mse = float(mean_squared_error(target[test_indices], test_prediction))
    rmse = float(math.sqrt(mse))
    r2 = float(r2_score(target[test_indices], test_prediction))

    model = LinearRegression().fit(matrix, target)
    term_definitions = term_info(exercise_id, config)
    target_std = float(np.std(target)) or 1.0
    term_std = np.std(matrix, axis=0)
    standardized_terms = model.coef_ * term_std / target_std

    feature_impacts = []
    for feature_key, label in zip(config["features"], config["feature_labels"]):
        matching = [
            index
            for index, (_, term_key, _) in enumerate(term_definitions)
            if term_key == feature_key
        ]
        impact = float(
            math.sqrt(sum(float(standardized_terms[index]) ** 2 for index in matching))
        )
        feature_impacts.append((feature_key, label, impact))
    feature_impacts.sort(key=lambda item: item[2], reverse=True)

    coefficients = []
    for index, (label, feature_key, unit) in enumerate(term_definitions):
        beta = float(model.coef_[index])
        normalized = float(standardized_terms[index])
        if exercise_id == "energia" and feature_key == "Hora":
            explanation = (
                "Parte de la codificación cíclica de la hora; se interpreta junto "
                "con el término seno/coseno complementario."
            )
        else:
            explanation = (
                f"Por cada aumento de 1 {unit}, cambia la predicción en "
                f"{beta:.4f} {config['unit']}, manteniendo las demás variables constantes."
            )
        coefficients.append(
            {
                "term": label,
                "featureKey": feature_key,
                "coefficient": beta,
                "standardizedImpact": normalized,
                "direction": (
                    "neutral"
                    if abs(normalized) < 1e-8
                    else "positive"
                    if normalized > 0
                    else "negative"
                ),
                "explanation": explanation,
            }
        )

    model_path = MODEL_DIR / f"{exercise_id}_regresion.joblib"
    joblib.dump(
        {
            "exercise_id": exercise_id,
            "model": model,
            "feature_order": config["features"],
            "target": config["target"],
            "target_label": config["target_label"],
            "target_unit": config["unit"],
            "hour_encoding": (
                "sin(2π·hora/24), cos(2π·hora/24)"
                if exercise_id == "energia"
                else None
            ),
        },
        model_path,
    )

    return {
        "id": exercise_id,
        "title": config["title"],
        "target_label": config["target_label"],
        "target_unit": config["unit"],
        "features": config["feature_labels"],
        "feature_units": config["feature_units"],
        "cleaning": cleaning,
        "mse": mse,
        "rmse": rmse,
        "r2": r2,
        "train_rows": len(train_indices),
        "test_rows": len(test_indices),
        "feature_impacts": feature_impacts,
        "coefficients": coefficients,
        "model_path": model_path,
        "rows": data,
    }


def write_report(results: list[dict]) -> None:
    lines = [
        "# Informe de laboratorio — Minería de datos",
        "",
        "## Objetivo y metodología",
        "",
        "Se aplicó CRISP-DM a tres conjuntos cuantitativos. Se revisó la estructura y "
        "calidad, se normalizaron encabezados y números, se imputaron predictores "
        "faltantes con mediana, se eliminaron filas sin objetivo válido y duplicados "
        "exactos. Los valores atípicos se detectaron con IQR (1,5×) y se conservaron "
        "porque ser extremos no demuestra que sean errores.",
        "",
        "Los modelos son regresiones lineales múltiples. El desempeño se estimó en un "
        "conjunto de prueba separado (20 %, semilla fija 42); después cada modelo final "
        "se ajustó con todas las filas válidas y se exportó con joblib. En energía, "
        "la hora se codificó con seno y coseno para representar su naturaleza cíclica.",
        "",
        "## Resultados por ejercicio",
        "",
    ]
    for result in results:
        report = result["cleaning"]
        lines.extend(
            [
                f"### {result['title']}",
                "",
                f"- Filas: {report['inputRows']} originales; {report['retainedRows']} conservadas.",
                f"- Limpieza: {report['invalidRows']} filas descartadas por objetivo inválido, "
                f"{report['duplicateRows']} duplicadas, {report['missingValues']} celdas faltantes, "
                f"{report['imputedValues']} imputaciones.",
                f"- Atípicos: {report['flaggedOutlierRows']} filas marcadas "
                f"({report['flaggedOutlierValues']} valores); no se eliminaron.",
                f"- Evaluación: MSE = {result['mse']:.6f}; RMSE = {result['rmse']:.6f}; "
                f"R² = {result['r2']:.6f} (prueba n={result['test_rows']}).",
                f"- Mayor impacto estandarizado: {result['feature_impacts'][0][1]} "
                f"({result['feature_impacts'][0][2]:.4f}).",
                "",
                "| Término | Coeficiente | Impacto estandarizado |",
                "|---|---:|---:|",
            ]
        )
        for coefficient in result["coefficients"]:
            lines.append(
                f"| {coefficient['term']} | {coefficient['coefficient']:.6f} | "
                f"{coefficient['standardizedImpact']:.6f} |"
            )
        lines.append("")

    best = max(results, key=lambda result: result["r2"])
    lines.extend(
        [
            "## Conclusiones",
            "",
            f"El mayor R² en los datos de prueba fue el de **{best['title']}** "
            f"(R² = {best['r2']:.4f}). El impacto relativo se comparó con coeficientes "
            "estandarizados, no con los coeficientes brutos, porque las variables usan "
            "unidades distintas. Estos resultados describen los CSV entregados; no "
            "establecen causalidad y su capacidad predictiva depende de que los datos "
            "futuros mantengan patrones similares.",
            "",
            "Los archivos `.joblib` deben cargarse únicamente si se confía en su origen: "
            "joblib utiliza serialización pickle y no es seguro abrir archivos de terceros.",
            "",
            "## Reproducción",
            "",
            "Instalar `pandas`, `scikit-learn` y `joblib`, y ejecutar `python train_models.py`. "
            "El script vuelve a limpiar, entrenar, evaluar, exportar los modelos y generar "
            "este informe y los CSV limpios.",
            "",
        ]
    )
    (ROOT / "informe_resultados.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    results = [train_one(exercise_id, config) for exercise_id, config in EXERCISES.items()]
    write_report(results)
    for result in results:
        print(
            f"{result['title']}: n={result['cleaning']['retainedRows']}, "
            f"MSE={result['mse']:.6f}, RMSE={result['rmse']:.6f}, "
            f"R²={result['r2']:.6f}, mayor impacto={result['feature_impacts'][0][1]}"
        )
    print(f"Modelos: {MODEL_DIR}")
    print(f"Informe: {ROOT / 'informe_resultados.md'}")


if __name__ == "__main__":
    main()