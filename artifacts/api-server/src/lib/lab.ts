import { readFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";
import {
  GetExerciseAnalysisResponse,
  GetLabOverviewResponse,
  PredictExerciseResponse,
} from "@workspace/api-zod";

export type ExerciseId = "dolar" | "glucosa" | "energia";

type FeatureConfig = {
  key: string;
  label: string;
  unit: string;
  aliases: string[];
  valid: (value: number) => boolean;
};

type ExerciseConfig = {
  id: ExerciseId;
  title: string;
  description: string;
  csv: string;
  target: {
    key: string;
    label: string;
    unit: string;
    aliases: string[];
    valid: (value: number) => boolean;
  };
  features: FeatureConfig[];
  primaryMetricLabel: string;
};

type CleanRow = { values: number[]; target: number };
type NumericCell = { value: number | null; missing: boolean; invalid: boolean };
type Term = { label: string; featureKey: string; unit: string };
type FittedModel = {
  intercept: number;
  coefficients: number[];
  terms: Term[];
};
type ExerciseSummary = {
  id: ExerciseId;
  title: string;
  targetLabel: string;
  targetUnit: string;
  rows: number;
  r2: number;
  primaryMetricLabel: string;
  primaryMetricValue: number;
  invalidRows: number;
  duplicateRows: number;
  flaggedOutlierRows: number;
  strongestFeature: string;
};
type ExerciseState = {
  config: ExerciseConfig;
  rows: CleanRow[];
  model: FittedModel;
  analysis: ReturnType<typeof GetExerciseAnalysisResponse.parse>;
  summary: ExerciseSummary;
};

const EXERCISES: ExerciseConfig[] = [
  {
    id: "dolar",
    title: "Precio del dólar",
    description:
      "Regresión lineal múltiple para estimar el precio del dólar a partir del día, la inflación y la tasa de interés.",
    csv: "dolar_data.csv",
    target: {
      key: "Precio_Dolar",
      label: "Precio del dólar",
      unit: "COP",
      aliases: ["Precio_Dolar", "precio dolar", "exchange rate", "dollar price"],
      valid: (value) => value > 0,
    },
    features: [
      {
        key: "Dia",
        label: "Día",
        unit: "día",
        aliases: ["Dia", "día", "day", "numero de dia"],
        valid: (value) => Number.isInteger(value) && value >= 1,
      },
      {
        key: "Inflacion",
        label: "Inflación",
        unit: "proporción",
        aliases: ["Inflacion", "inflación", "inflation"],
        valid: Number.isFinite,
      },
      {
        key: "Tasa_interes",
        label: "Tasa de interés",
        unit: "puntos",
        aliases: ["Tasa_interes", "tasa interes", "interest rate"],
        valid: Number.isFinite,
      },
    ],
    primaryMetricLabel: "MSE de prueba",
  },
  {
    id: "glucosa",
    title: "Nivel de glucosa",
    description:
      "Regresión lineal múltiple para estimar glucosa en sangre según edad, IMC y actividad física semanal.",
    csv: "glucosa_data.csv",
    target: {
      key: "Nivel_Glucosa",
      label: "Nivel de glucosa",
      unit: "mg/dL",
      aliases: ["Nivel_Glucosa", "nivel glucosa", "glucose", "blood glucose"],
      valid: (value) => value >= 20 && value <= 1000,
    },
    features: [
      {
        key: "Edad",
        label: "Edad",
        unit: "años",
        aliases: ["Edad", "age"],
        valid: (value) => Number.isInteger(value) && value >= 0 && value <= 120,
      },
      {
        key: "IMC",
        label: "IMC",
        unit: "kg/m²",
        aliases: ["IMC", "bmi", "indice de masa corporal"],
        valid: (value) => value > 0 && value <= 100,
      },
      {
        key: "Actividad_Fisica",
        label: "Actividad física",
        unit: "horas/semana",
        aliases: ["Actividad_Fisica", "actividad fisica", "physical activity"],
        valid: (value) => value >= 0 && value <= 168,
      },
    ],
    primaryMetricLabel: "MSE de prueba",
  },
  {
    id: "energia",
    title: "Consumo de energía",
    description:
      "Regresión lineal múltiple para estimar consumo eléctrico según temperatura, hora del día y día de la semana.",
    csv: "energia_data.csv",
    target: {
      key: "Consumo_Energia",
      label: "Consumo de energía",
      unit: "kWh",
      aliases: ["Consumo_Energia", "consumo energia", "energy consumption"],
      valid: (value) => value > 0,
    },
    features: [
      {
        key: "Temperatura",
        label: "Temperatura",
        unit: "°C",
        aliases: ["Temperatura", "temperature", "temp"],
        valid: (value) => value >= -100 && value <= 100,
      },
      {
        key: "Hora",
        label: "Hora",
        unit: "hora",
        aliases: ["Hora", "hour"],
        valid: (value) =>
          Number.isInteger(value) && value >= 0 && value <= 24,
      },
      {
        key: "Dia_Semana",
        label: "Día de la semana",
        unit: "día (1–7)",
        aliases: ["Dia_Semana", "dia semana", "day of week", "weekday"],
        valid: (value) => Number.isInteger(value) && value >= 1 && value <= 7,
      },
    ],
    primaryMetricLabel: "RMSE de prueba",
  },
];

function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseNumericCell(value: unknown): NumericCell {
  const text = String(value ?? "").trim();
  if (
    text === "" ||
    ["na", "n/a", "null", "none", "nan", "-", "?"].includes(text.toLowerCase())
  ) {
    return { value: null, missing: true, invalid: false };
  }

  let normalized = text.replace(/\s/g, "").replace(/[^\d,.\-+eE]/g, "");
  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, missing: false, invalid: true };
  }
  return { value: parsed, missing: false, invalid: false };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function quantile(sorted: number[], probability: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const fraction = position - lower;
  return (
    sorted[lower]! * (1 - fraction) +
    sorted[Math.min(lower + 1, sorted.length - 1)]! * fraction
  );
}

function cleanDataset(config: ExerciseConfig): {
  rows: CleanRow[];
  report: {
    inputRows: number;
    retainedRows: number;
    invalidRows: number;
    duplicateRows: number;
    missingValues: number;
    imputedValues: number;
    flaggedOutlierRows: number;
    flaggedOutlierValues: number;
    methods: string[];
  };
} {
  const csv = readFileSync(join(process.cwd(), "data", config.csv), "utf8");
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: normalizeHeader,
  });
  const headers = parsed.meta.fields ?? [];
  const allColumns = [...config.features, config.target];
  const columnKeys = allColumns.map((column) => {
    const aliases = new Set(column.aliases.map(normalizeHeader));
    const match = headers.find((header) => aliases.has(header));
    if (!match) {
      throw new Error(
        `El archivo ${config.csv} no contiene la columna requerida “${column.key}”.`,
      );
    }
    return match;
  });

  let missingValues = 0;
  let invalidNumericValues = 0;
  let invalidRows = 0;
  let domainCorrections = 0;
  const staged: Array<{ values: Array<number | null>; target: number }> = [];

  for (const sourceRow of parsed.data) {
    const cells = columnKeys.map((column) =>
      parseNumericCell(sourceRow[column]),
    );
    for (const cell of cells) {
      if (cell.missing) missingValues += 1;
      if (cell.invalid) invalidNumericValues += 1;
    }

    const targetCell = cells[cells.length - 1]!;
    if (
      targetCell.value === null ||
      !config.target.valid(targetCell.value)
    ) {
      invalidRows += 1;
      continue;
    }

    const values = cells.slice(0, -1).map((cell, index) => {
      let value = cell.value;
      if (value !== null && config.features[index]!.key === "Hora" && value === 0) {
        value = 24;
        domainCorrections += 1;
      }
      if (value !== null && !config.features[index]!.valid(value)) {
        value = null;
        domainCorrections += 1;
      }
      return value;
    });
    staged.push({ values, target: targetCell.value });
  }

  const medians = config.features.map((_, index) =>
    median(
      staged
        .map((row) => row.values[index])
        .filter((value): value is number => value !== null),
    ),
  );
  let imputedValues = 0;
  const filled = staged.map((row) => ({
    target: row.target,
    values: row.values.map((value, index) => {
      if (value !== null) return value;
      imputedValues += 1;
      return medians[index]!;
    }),
  }));

  const uniqueRows: CleanRow[] = [];
  const seen = new Set<string>();
  let duplicateRows = 0;
  for (const row of filled) {
    const key = [...row.values, row.target]
      .map((value) => value.toPrecision(12))
      .join("|");
    if (seen.has(key)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(key);
    uniqueRows.push(row);
  }

  const columns = config.features.length + 1;
  const bounds = Array.from({ length: columns }, (_, columnIndex) => {
    const values = uniqueRows
      .map((row) =>
        columnIndex === config.features.length
          ? row.target
          : row.values[columnIndex]!,
      )
      .sort((a, b) => a - b);
    const q1 = quantile(values, 0.25);
    const q3 = quantile(values, 0.75);
    const spread = q3 - q1;
    return [q1 - 1.5 * spread, q3 + 1.5 * spread] as const;
  });
  let flaggedOutlierRows = 0;
  let flaggedOutlierValues = 0;
  for (const row of uniqueRows) {
    let hasOutlier = false;
    const values = [...row.values, row.target];
    values.forEach((value, index) => {
      if (value < bounds[index]![0] || value > bounds[index]![1]) {
        flaggedOutlierValues += 1;
        hasOutlier = true;
      }
    });
    if (hasOutlier) flaggedOutlierRows += 1;
  }

  const methods = [
    "Se normalizaron encabezados (acentos, espacios y mayúsculas) y se interpretaron decimales con punto o coma.",
    "Los valores numéricos faltantes o inválidos en predictores se imputaron con la mediana de su columna.",
    "Se descartaron filas sin objetivo válido y se eliminaron duplicados exactos después de normalizar los valores.",
    "Los atípicos se marcaron con el criterio IQR (1,5 × rango intercuartílico); no se eliminaron automáticamente.",
    "El conjunto de prueba se separó aleatoriamente con semilla fija (80 % entrenamiento / 20 % prueba).",
  ];
  if (invalidNumericValues > 0) {
    methods.push(
      `${invalidNumericValues} celdas no numéricas se trataron como valores faltantes.`,
    );
  }
  if (domainCorrections > 0) {
    methods.push(
      `${domainCorrections} valores fuera de dominio se normalizaron o imputaron.`,
    );
  }

  return {
    rows: uniqueRows,
    report: {
      inputRows: parsed.data.length,
      retainedRows: uniqueRows.length,
      invalidRows,
      duplicateRows,
      missingValues,
      imputedValues,
      flaggedOutlierRows,
      flaggedOutlierValues,
      methods,
    },
  };
}

function modelTerms(config: ExerciseConfig): Term[] {
  if (config.id !== "energia") {
    return config.features.map((feature) => ({
      label: feature.label,
      featureKey: feature.key,
      unit: feature.unit,
    }));
  }
  return [
    { label: "Temperatura", featureKey: "Temperatura", unit: "°C" },
    { label: "Hora · seno", featureKey: "Hora", unit: "término cíclico" },
    { label: "Hora · coseno", featureKey: "Hora", unit: "término cíclico" },
    {
      label: "Día de la semana",
      featureKey: "Dia_Semana",
      unit: "día (1–7)",
    },
  ];
}

function expandFeatures(config: ExerciseConfig, values: number[]): number[] {
  if (config.id !== "energia") return values;
  const hour = values[1] === 0 ? 24 : values[1]!;
  const angle = (hour / 24) * 2 * Math.PI;
  return [values[0]!, Math.sin(angle), Math.cos(angle), values[2]!];
}

function seededShuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  let seed = 42;
  const random = (): number => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
      values.length,
  );
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row]![column]!) >
        Math.abs(augmented[pivot]![column]!)
      ) {
        pivot = row;
      }
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot]!,
      augmented[column]!,
    ];
    const divisor = augmented[column]![column]!;
    if (Math.abs(divisor) < 1e-12) {
      throw new Error("No fue posible ajustar el modelo: matriz singular.");
    }
    for (let index = column; index <= size; index += 1) {
      augmented[column]![index] = augmented[column]![index]! / divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let index = column; index <= size; index += 1) {
        augmented[row]![index] =
          augmented[row]![index]! - factor * augmented[column]![index]!;
      }
    }
  }
  return augmented.map((row) => row[size]!);
}

function fitLinearModel(
  config: ExerciseConfig,
  rows: CleanRow[],
): FittedModel {
  const terms = modelTerms(config);
  const expanded = rows.map((row) => expandFeatures(config, row.values));
  const columnMeans = terms.map(
    (_, column) =>
      expanded.reduce((sum, row) => sum + row[column]!, 0) / expanded.length,
  );
  const columnScales = terms.map((_, column) => {
    const scale = standardDeviation(expanded.map((row) => row[column]!));
    return scale > 1e-12 ? scale : 1;
  });
  const design = expanded.map((row) => [
    1,
    ...row.map((value, column) => (value - columnMeans[column]!) / columnScales[column]!),
  ]);
  const dimension = terms.length + 1;
  const normal = Array.from({ length: dimension }, () =>
    Array.from({ length: dimension }, () => 0),
  );
  const right = Array.from({ length: dimension }, () => 0);
  for (let rowIndex = 0; rowIndex < design.length; rowIndex += 1) {
    const row = design[rowIndex]!;
    const target = rows[rowIndex]!.target;
    for (let i = 0; i < dimension; i += 1) {
      right[i] += row[i]! * target;
      for (let j = 0; j < dimension; j += 1) {
        normal[i]![j] += row[i]! * row[j]!;
      }
    }
  }
  for (let index = 1; index < dimension; index += 1) {
    normal[index]![index] += 1e-10;
  }
  const scaledCoefficients = solveLinearSystem(normal, right);
  const coefficients = terms.map(
    (_, index) => scaledCoefficients[index + 1]! / columnScales[index]!,
  );
  const intercept =
    scaledCoefficients[0]! -
    coefficients.reduce(
      (sum, coefficient, index) =>
        sum + coefficient * columnMeans[index]!,
      0,
    );
  return { intercept, coefficients, terms };
}

function predictWithModel(
  config: ExerciseConfig,
  model: FittedModel,
  values: number[],
): number {
  const expanded = expandFeatures(config, values);
  return (
    model.intercept +
    model.coefficients.reduce(
      (sum, coefficient, index) => sum + coefficient * expanded[index]!,
      0,
    )
  );
}

function evaluateModel(config: ExerciseConfig, rows: CleanRow[]) {
  const shuffled = seededShuffle(rows);
  const testCount = Math.max(1, Math.round(rows.length * 0.2));
  const testRows = shuffled.slice(0, testCount);
  const trainRows = shuffled.slice(testCount);
  const holdoutModel = fitLinearModel(config, trainRows);
  const actualMean =
    testRows.reduce((sum, row) => sum + row.target, 0) / testRows.length;
  let squaredError = 0;
  let totalSquaredDeviation = 0;
  for (const row of testRows) {
    const error = row.target - predictWithModel(config, holdoutModel, row.values);
    squaredError += error ** 2;
    totalSquaredDeviation += (row.target - actualMean) ** 2;
  }
  const mse = squaredError / testRows.length;
  return {
    metrics: {
      mse,
      rmse: Math.sqrt(mse),
      r2:
        totalSquaredDeviation === 0
          ? 0
          : 1 - squaredError / totalSquaredDeviation,
      trainRows: trainRows.length,
      testRows: testRows.length,
      testShare: testRows.length / rows.length,
    },
    fullModel: fitLinearModel(config, rows),
  };
}

function rounded(value: number, decimals = 6): number {
  return Number(value.toFixed(decimals));
}

function buildExerciseState(config: ExerciseConfig): ExerciseState {
  const { rows, report } = cleanDataset(config);
  if (rows.length < 5) {
    throw new Error(
      `El conjunto ${config.csv} necesita al menos cinco filas válidas para entrenar y evaluar el modelo.`,
    );
  }
  const { metrics, fullModel } = evaluateModel(config, rows);
  const targetValues = rows.map((row) => row.target);
  const targetStd = standardDeviation(targetValues) || 1;
  const termStd = fullModel.terms.map((_, index) =>
    standardDeviation(
      rows.map((row) => expandFeatures(config, row.values)[index]!),
    ),
  );
  const impacts = config.features.map((feature, featureIndex) => {
    const matchingTerms = fullModel.terms
      .map((term, index) => ({ term, index }))
      .filter(({ term }) => term.featureKey === feature.key);
    const impact = Math.sqrt(
      matchingTerms.reduce((sum, { index }) => {
        const standardized =
          (fullModel.coefficients[index]! * termStd[index]!) / targetStd;
        return sum + standardized ** 2;
      }, 0),
    );
    return impact;
  });
  const order = impacts
    .map((impact, index) => ({ impact, index }))
    .sort((a, b) => b.impact - a.impact);
  const rankByFeature = new Map(
    order.map(({ index }, rank) => [config.features[index]!.key, rank + 1]),
  );
  const featureDefinitions = config.features.map((feature, index) => {
    const values = rows.map((row) => row.values[index]!);
    return {
      key: feature.key,
      label: feature.label,
      unit: feature.unit,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      standardizedImpact: impacts[index]!,
      rank: rankByFeature.get(feature.key)!,
    };
  });

  const coefficients = fullModel.terms.map((term, index) => {
    const coefficient = fullModel.coefficients[index]!;
    const standardizedImpact =
      (coefficient * termStd[index]!) / targetStd;
    const feature = config.features.find(
      (candidate) => candidate.key === term.featureKey,
    )!;
    const explanation =
      config.id === "energia" && term.featureKey === "Hora"
        ? "Este coeficiente forma parte de la codificación cíclica de la hora; se interpreta junto con el término seno/coseno complementario."
        : `Manteniendo constantes las demás variables, un aumento de 1 ${feature.unit} cambia la predicción en ${rounded(coefficient, 4)} ${config.target.unit}.`;
    return {
      term: term.label,
      featureKey: term.featureKey,
      coefficient,
      standardizedImpact,
      direction:
        Math.abs(standardizedImpact) < 1e-8
          ? "neutral"
          : standardizedImpact > 0
            ? "positive"
            : "negative",
      explanation,
    };
  });

  const scatterLimit = 320;
  const stride = Math.max(1, Math.ceil(rows.length / scatterLimit));
  const scatterSeries = config.features.map((feature, featureIndex) => ({
    featureKey: feature.key,
    label: feature.label,
    unit: feature.unit,
    points: rows
      .filter((_, rowIndex) => rowIndex % stride === 0)
      .map((row) => ({
        x: row.values[featureIndex]!,
        y: row.target,
      })),
  }));
  const strongestFeature =
    featureDefinitions.find((feature) => feature.rank === 1)?.label ?? "N/D";
  const summary: ExerciseSummary = {
    id: config.id,
    title: config.title,
    targetLabel: config.target.label,
    targetUnit: config.target.unit,
    rows: rows.length,
    r2: metrics.r2,
    primaryMetricLabel: config.primaryMetricLabel,
    primaryMetricValue:
      config.id === "energia" ? metrics.rmse : metrics.mse,
    invalidRows: report.invalidRows,
    duplicateRows: report.duplicateRows,
    flaggedOutlierRows: report.flaggedOutlierRows,
    strongestFeature,
  };
  const analysis = GetExerciseAnalysisResponse.parse({
    id: config.id,
    title: config.title,
    description: config.description,
    targetLabel: config.target.label,
    targetUnit: config.target.unit,
    primaryMetricLabel: config.primaryMetricLabel,
    cleaning: report,
    metrics,
    features: featureDefinitions,
    coefficients,
    scatterSeries,
    cleanedRows: rows,
    strongestFeature,
  });
  return {
    config,
    rows,
    model: fullModel,
    summary,
    analysis,
  };
}

const states = new Map<ExerciseId, ExerciseState>();
for (const config of EXERCISES) {
  states.set(config.id, buildExerciseState(config));
}

function requireState(id: ExerciseId): ExerciseState {
  const state = states.get(id);
  if (!state) throw new Error(`Ejercicio desconocido: ${id}`);
  return state;
}

export function getLabOverview() {
  const summaries = [...states.values()].map((state) => state.summary);
  const totalRows = [...states.values()].reduce(
    (sum, state) => sum + state.rows.length,
    0,
  );
  const meanR2 =
    summaries.reduce((sum, summary) => sum + summary.r2, 0) / summaries.length;
  return GetLabOverviewResponse.parse({
    exerciseCount: summaries.length,
    totalRows,
    meanR2,
    exercises: summaries,
  });
}

export function getExerciseAnalysis(id: ExerciseId) {
  return requireState(id).analysis;
}

export function predictExercise(id: ExerciseId, values: number[]) {
  const state = requireState(id);
  if (values.length !== state.config.features.length) {
    throw new Error(
      `Se requieren ${state.config.features.length} valores en el orden indicado.`,
    );
  }
  if (
    values.some(
      (value, index) =>
        !Number.isFinite(value) || !state.config.features[index]!.valid(value),
    )
  ) {
    throw new Error("Uno o más valores están fuera del dominio válido.");
  }
  const predictedValue = predictWithModel(state.config, state.model, values);
  const extrapolated = values.some((value, index) => {
    const observed = state.analysis.features[index]!;
    return value < observed.min || value > observed.max;
  });
  const baseNote =
    "Estimación de regresión lineal múltiple; no sustituye una evaluación clínica ni un dato oficial.";
  return PredictExerciseResponse.parse({
    exerciseId: id,
    targetLabel: state.config.target.label,
    targetUnit: state.config.target.unit,
    predictedValue,
    note: extrapolated
      ? `${baseNote} Al menos un valor está fuera del rango observado; interpreta el resultado con cautela.`
      : baseNote,
  });
}