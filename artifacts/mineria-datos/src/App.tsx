import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { CSVLink } from 'react-csv';
import {
  useGetLabOverview, useGetExerciseAnalysis, getGetExerciseAnalysisQueryKey,
  getGetLabOverviewQueryKey, usePredictExercise,
} from '@workspace/api-client-react';
import type { ExerciseId, ExerciseSummary, ExerciseAnalysis, LabOverview } from '@workspace/api-client-react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Beaker, Check, ChevronDown, CircleHelp,
  Download, FlaskConical, Moon, Printer, RefreshCw, Sun, Waves, AlertTriangle,
} from 'lucide-react';
import {
  CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import '@/index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false } },
});
const IDS: ExerciseId[] = ['dolar', 'glucosa', 'energia'];
const INTERVALS = [{ label: '5 minutos', ms: 300000 }, { label: '15 minutos', ms: 900000 }, { label: '1 hora', ms: 3600000 }];
const LABELS: Record<string, string> = {
  dolar: 'Tipo de cambio', glucosa: 'Glucosa', energia: 'Consumo de energía',
};
const COLORS = ['#a84d31', '#327b79', '#d19a35'];
const nfmt = (n: number, digits = 2) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: digits }).format(n);
const pct = (n: number) => `${nfmt(n * 100, 1)}%`;
const assetHref = (path: string) => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
type OverviewQuery = ReturnType<typeof useGetLabOverview<LabOverview>>;

function Shell({ dark, toggleDark }: { dark: boolean; toggleDark: () => void }) {
  const [path] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdown = useRef<HTMLDivElement>(null);
  const isExercise = path.startsWith('/exercise/');
  const id = (path.split('/')[2] || '') as ExerciseId;
  const overview = useGetLabOverview<LabOverview>();
  const exerciseQuery = useGetExerciseAnalysis(id || 'dolar', {
    query: { enabled: isExercise && IDS.includes(id), queryKey: getGetExerciseAnalysisQueryKey(id || 'dolar') },
  });
  const prediction = usePredictExercise();
  const qc = useQueryClient();
  useEffect(() => {
    prediction.reset();
  }, [id, prediction.reset]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [interval, setInterval] = useState(300000);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(() => {
      void qc.invalidateQueries({ queryKey: getGetLabOverviewQueryKey() });
      if (isExercise && IDS.includes(id)) void qc.invalidateQueries({ queryKey: getGetExerciseAnalysisQueryKey(id) });
    }, Math.max(300000, interval));
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval, qc, isExercise, id]);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (dropdown.current && !dropdown.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: getGetLabOverviewQueryKey() });
    if (isExercise && IDS.includes(id)) void qc.invalidateQueries({ queryKey: getGetExerciseAnalysisQueryKey(id) });
  };
  const analysis = exerciseQuery.data;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className="lab-sidebar print:hidden">
        <Link href="/" className="brand-lockup" data-testid="link-home">
          <span className="brand-mark"><Activity size={18} /></span>
          <span><b>TRAZA</b><small>LABORATORIO DE DATOS</small></span>
        </Link>
        <div className="side-section-label">ESPACIO DE TRABAJO</div>
        <Link href="/" className={`side-link ${!isExercise ? 'active' : ''}`} data-testid="link-overview">
          <span className="side-icon"><Waves size={16} /></span>Vista general
          <span className="side-count">03</span>
        </Link>
        <div className="side-section-label side-label-spaced">EJERCICIOS</div>
        {IDS.map((exerciseId, i) => (
          <Link key={exerciseId} href={`/exercise/${exerciseId}`} className={`side-link ${id === exerciseId ? 'active' : ''}`} data-testid={`link-exercise-${exerciseId}`}>
            <span className={`exercise-index index-${exerciseId}`}>0{i + 1}</span>
            <span>{LABELS[exerciseId]}</span>
            {id === exerciseId && <span className="active-dot" />}
          </Link>
        ))}
        <div className="sidebar-note">
          <div className="note-kicker"><FlaskConical size={13} /> MÉTODO CRISP-DM</div>
          <p>Del dato observado a una predicción que puedas explicar.</p>
          <div className="crisp-steps">COMPRENDER · PREPARAR<br />MODELAR · EVALUAR</div>
        </div>
        <div className="sidebar-foot"><span className="status-pip" /> DATOS DEL LABORATORIO <span>v1.0</span></div>
      </aside>
      <div className="main-column">
        <header className="topbar print:hidden">
          <div className="crumb"><span>MINERÍA DE DATOS</span><span className="crumb-sep">/</span><b>{isExercise ? (LABELS[id] || 'Ejercicio') : 'RESUMEN DEL LABORATORIO'}</b></div>
          <div className="toolbar">
            <div className="relative" ref={dropdown}>
              <div className="refresh-control">
                <button onClick={refresh} className="refresh-main" data-testid="button-refresh"><RefreshCw size={14} /> Actualizar</button>
                <button className="refresh-caret" onClick={() => setMenuOpen((o) => !o)} aria-label="Opciones de actualización" data-testid="button-refresh-options"><ChevronDown size={13} /></button>
              </div>
              {menuOpen && <div className="refresh-menu">
                <div className="menu-title">ACTUALIZACIÓN AUTOMÁTICA</div>
                <button className="menu-option" onClick={() => setAutoRefresh((v) => !v)} data-testid="toggle-auto-refresh">
                  <span>{autoRefresh ? 'Activada' : 'Desactivada'}</span><span className={`switch ${autoRefresh ? 'on' : ''}`}><i /></span>
                </button>
                {INTERVALS.map((item) => <button key={item.ms} className="menu-option" onClick={() => { setInterval(item.ms); setAutoRefresh(true); setMenuOpen(false); }} data-testid={`interval-${item.ms}`}>
                  <span>{item.label}</span>{interval === item.ms && autoRefresh && <Check size={14} />}
                </button>)}
                <p>Los datos del laboratorio son estáticos; la actualización vuelve a consultar el conjunto suministrado.</p>
              </div>}
            </div>
            <button className="tool-button" onClick={() => window.print()} aria-label="Exportar como PDF" data-testid="button-export-pdf"><Printer size={15} /></button>
            <button className="tool-button" onClick={toggleDark} aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'} data-testid="button-toggle-dark">{dark ? <Sun size={15} /> : <Moon size={15} />}</button>
          </div>
        </header>
        <main className="page-content">
          <Switch>
            <Route path="/"><OverviewPage overview={overview} /></Route>
            <Route path="/exercise/:id">
              {() => !IDS.includes(id) ? <NotFound /> : <ExercisePage
                id={id} analysis={analysis} loading={exerciseQuery.isLoading || exerciseQuery.isFetching}
                error={exerciseQuery.error} retry={exerciseQuery.refetch}
                prediction={prediction}
              />}
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function OverviewPage({ overview }: { overview: OverviewQuery }) {
  if (overview.isLoading && !overview.data) return <PageLoading />;
  if (overview.error && !overview.data) return <ErrorPanel retry={() => void overview.refetch()} />;
  const data = overview.data;
  if (!data) return <EmptyPanel title="Aún no hay conjuntos disponibles" text="El resumen del laboratorio no contiene ejercicios." />;
  return <div className="enter">
    <div className="hero-band">
      <div className="hero-grid paper-grid" />
      <div className="hero-copy">
        <div className="eyebrow"><span className="eyebrow-line" /> PRÁCTICA GUIADA · REGRESIÓN LINEAL MÚLTIPLE</div>
        <h1 className="font-display">Leer los datos.<br /><em>Entender el modelo.</em></h1>
        <p>Un espacio de trabajo para explorar tres problemas reales, revisar cada decisión de limpieza y probar predicciones con criterio.</p>
        <div className="hero-meta"><span><span className="status-pip" /> CONJUNTOS LISTOS</span><span>FLUJO CRISP-DM</span><span>03 MODELOS</span></div>
      </div>
      <div className="hero-aside">
        <div className="orbit-ring ring-one" /><div className="orbit-ring ring-two" />
        <div className="hero-orbit"><span>r</span><small>DATOS<br />→ MODELO</small></div>
        <div className="orbit-caption">UNA VARIABLE<br />NO CUENTA TODA LA HISTORIA</div>
      </div>
    </div>
    <section className="overview-intro">
      <div><span className="section-index">01 — CONTEXTO</span><h2 className="font-display">Tres preguntas.<br />Una forma de pensar.</h2></div>
      <p>La calidad predictiva es solo el comienzo. En cada ejercicio puedes seguir el rastro desde los registros originales hasta el conjunto depurado, leer qué variables pesan y ver dónde el modelo se equivoca.</p>
    </section>
    <div className="summary-strip" data-testid="overview-summary">
      <SummaryMetric label="EJERCICIOS" value={nfmt(data.exerciseCount, 0)} detail="regresiones en práctica" />
      <SummaryMetric label="FILAS ANALIZADAS" value={nfmt(data.totalRows, 0)} detail="observaciones suministradas" />
      <SummaryMetric label="R² MEDIO" value={nfmt(data.meanR2, 3)} detail="varianza explicada promedio" accent />
      <div className="summary-aside"><CircleHelp size={17} /><span>R² resume el ajuste; no prueba causalidad ni garantiza acierto en cada caso.</span></div>
    </div>
    <div className="section-heading">
      <div><span className="section-index">02 — RECORRIDO</span><h2 className="font-display">Elige un conjunto</h2></div>
      <span className="section-caption">EXPLORA · INTERPRETA · PREDICE</span>
    </div>
    <div className="exercise-list">
      {data.exercises.map((exercise, index) => <ExerciseCard key={exercise.id} exercise={exercise} index={index} />)}
    </div>
    <div className="section-heading deliverables-heading">
      <div><span className="section-index">03 — ENTREGABLES</span><h2 className="font-display">Informe y modelos</h2></div>
      <span className="section-caption">ARCHIVOS PARA DESCARGAR Y REPRODUCIR</span>
    </div>
    <section className="deliverables-grid" aria-label="Entregables del laboratorio" data-testid="lab-deliverables">
      <a className="deliverable-card" href={assetHref('entregables/informe_resultados.md')} download>
        <span className="deliverable-type">INFORME ESCRITO</span><b>Resultados y conclusiones</b>
        <small>Metodología CRISP-DM, métricas, coeficientes y decisiones de limpieza.</small><Download size={16} />
      </a>
      <a className="deliverable-card" href={assetHref('entregables/train_models.py')} download>
        <span className="deliverable-type">REPRODUCIBILIDAD</span><b>Script de entrenamiento</b>
        <small>Python · vuelve a limpiar, evaluar y exportar los tres modelos.</small><Download size={16} />
      </a>
      {IDS.map((id, index) => (
        <a className="deliverable-card model-deliverable" key={id} href={assetHref(`entregables/models/${id}_regresion.joblib`)} download>
          <span className="deliverable-type">MODELO {String(index + 1).padStart(2, '0')} · JOBLIB</span><b>{LABELS[id]}</b>
          <small>Regresión ajustada con todas las filas limpias.</small><Download size={16} />
        </a>
      ))}
    </section>
    <div className="closing-note"><span className="closing-mark">“</span><p>Una predicción útil no es solo un número.<br /><b>Es un número con contexto.</b></p><span className="closing-sign">CUADERNO DE LABORATORIO / 01</span></div>
  </div>;
}

function SummaryMetric({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return <div className="summary-metric"><span className="metric-label">{label}</span><strong className={accent ? 'metric-accent' : ''} data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</strong><small>{detail}</small></div>;
}

function ExerciseCard({ exercise, index }: { exercise: ExerciseSummary; index: number }) {
  const metricUnit = exercise.primaryMetricLabel.startsWith('MSE')
    ? `(${exercise.targetUnit})²`
    : exercise.targetUnit;
  return <Link href={`/exercise/${exercise.id}`} className={`exercise-card card-${exercise.id}`} data-testid={`card-exercise-${exercise.id}`}>
    <div className="card-index">{String(index + 1).padStart(2, '0')} <span> / 03</span></div>
    <div className="card-main"><div className="card-kicker">{exercise.rows.toLocaleString('es-ES')} REGISTROS · OBJETIVO: {exercise.targetLabel.toUpperCase()}</div>
      <h3 className="font-display">{exercise.title}</h3><p>Estimar <b>{exercise.targetLabel.toLowerCase()}</b> con variables observadas. La relación más marcada: <b>{exercise.strongestFeature}</b>.</p>
      <span className="card-link">ABRIR ANÁLISIS <ArrowUpRight size={15} /></span>
    </div>
    <div className="card-stats">
      <span>R² DEL MODELO</span><strong>{nfmt(exercise.r2, 3)}</strong><div className="mini-meter"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, exercise.r2))})` }} /></div>
       <small>{exercise.primaryMetricLabel}: {nfmt(exercise.primaryMetricValue)} {metricUnit}</small>
    </div>
    <span className="card-corner"><ArrowUpRight size={16} /></span>
  </Link>;
}

function ExercisePage({ id, analysis, loading, error, retry, prediction }: {
  id: ExerciseId; analysis?: ExerciseAnalysis; loading: boolean; error: unknown; retry: () => unknown;
  prediction: ReturnType<typeof usePredictExercise>; overviewExercise?: ExerciseSummary;
}) {
  if (loading && !analysis) return <PageLoading />;
  if (error && !analysis) return <ErrorPanel retry={() => void retry()} />;
  if (!analysis) return <EmptyPanel title="No hay análisis disponible" text="Prueba a actualizar los datos del laboratorio." />;
  const data = analysis;
  const rows = data.cleanedRows.map((row) => Object.fromEntries([
    ...data.features.map((feature, i) => [feature.label, row.values[i] ?? '']),
    [data.targetLabel, row.target],
  ]));
  const rowsForDownload = rows.length ? rows : [{ Estado: 'Sin registros limpios' }];
  return <div className="enter">
    <div className={`exercise-hero exercise-hero-${id}`}>
      <div className="exercise-hero-top"><Link href="/" className="back-link" data-testid="link-back-overview">← Volver al resumen</Link><span className="hero-counter">EJERCICIO {String(IDS.indexOf(id) + 1).padStart(2, '0')} / 03</span></div>
      <span className="section-index">MODELADO · REGRESIÓN LINEAL MÚLTIPLE</span>
      <h1 className="font-display">{data.title}</h1>
      <p>{data.description}</p>
      <div className="exercise-hero-bottom"><span>VARIABLE OBJETIVO <b>{data.targetLabel}</b></span><span>SEÑAL MÁS FUERTE <b>{data.strongestFeature}</b></span><span>FILAS CONSERVADAS <b>{nfmt(data.cleaning.retainedRows, 0)}</b></span><a className="hero-model-download" href={assetHref(`entregables/models/${id}_regresion.joblib`)} download><Download size={13} /> DESCARGAR MODELO .JOBLIB</a></div>
    </div>
    <div className="report-intro"><div><span className="section-index">01 — CALIDAD DE DATOS</span><h2 className="font-display">Antes del modelo,<br />el conjunto.</h2></div><p>La preparación modifica qué aprende una regresión. Aquí queda explícito qué se descartó, qué se completó y qué se marcó para inspección.</p></div>
    <section className="cleaning-panel">
      <div className="cleaning-flow">
        <div className="flow-cell"><span>ENTRADA</span><strong>{nfmt(data.cleaning.inputRows, 0)}</strong><small>filas originales</small></div>
        <div className="flow-arrow">→</div>
        <div className="flow-cell retained"><span>CONSERVADAS</span><strong>{nfmt(data.cleaning.retainedRows, 0)}</strong><small>filas para modelado</small></div>
        <div className="flow-cell compact"><span>INVÁLIDAS</span><strong>{nfmt(data.cleaning.invalidRows, 0)}</strong></div>
        <div className="flow-cell compact"><span>DUPLICADAS</span><strong>{nfmt(data.cleaning.duplicateRows, 0)}</strong></div>
        <div className="flow-cell compact warning"><span>ATÍPICAS MARCADAS</span><strong>{nfmt(data.cleaning.flaggedOutlierRows, 0)}</strong><small>{nfmt(data.cleaning.flaggedOutlierValues, 0)} valores</small></div>
      </div>
      <div className="cleaning-bottom"><div className="missing-info"><span>VALORES AUSENTES</span><b>{nfmt(data.cleaning.missingValues, 0)}</b><span className="thin-divider">/</span><span>IMPUTADOS</span><b>{nfmt(data.cleaning.imputedValues, 0)}</b></div>
        <div className="method-list">{data.cleaning.methods.map((method) => <span key={method}>{method}</span>)}</div>
      </div>
    </section>
    <div className="section-heading analysis-heading"><div><span className="section-index">02 — EVALUACIÓN</span><h2 className="font-display">¿Qué tan bien ajusta?</h2></div><div className="metric-test">PRUEBA <b>{pct(data.metrics.testShare)}</b><span>·</span>{nfmt(data.metrics.testRows, 0)} filas reservadas</div></div>
    <div className="metric-grid">
      <MetricCard title="R² · VARIANZA EXPLICADA" value={nfmt(data.metrics.r2, 3)} note="Proporción de variación descrita por el modelo" visual="r2" />
      <MetricCard title="RMSE · ERROR TÍPICO" value={`${nfmt(data.metrics.rmse)} ${data.targetUnit}`} note="Error en unidades de la variable objetivo" visual="rmse" />
      <MetricCard title="MSE · ERROR CUADRÁTICO" value={nfmt(data.metrics.mse)} note="Penaliza con más fuerza los errores grandes" visual="mse" />
      <div className="split-stat"><div><span>ENTRENAMIENTO</span><b>{nfmt(data.metrics.trainRows, 0)}</b><small>registros</small></div><div><span>PRUEBA</span><b>{nfmt(data.metrics.testRows, 0)}</b><small>registros no vistos al entrenar</small></div></div>
    </div>
    <section className="interpretation-callout"><div className="callout-icon"><AlertTriangle size={16} /></div><p><b>Lee el error en su escala.</b> Un RMSE de {nfmt(data.metrics.rmse)} {data.targetUnit} indica el tamaño típico del desvío; contrástalo con el rango real y la consecuencia de equivocarse.</p><span>NO CONFUNDIR AJUSTE CON CAUSALIDAD</span></section>
    <div className="section-heading analysis-heading"><div><span className="section-index">03 — VARIABLES</span><h2 className="font-display">Qué mueve la estimación</h2></div><span className="section-caption">IMPACTO ESTANDARIZADO · NO ES CAUSALIDAD</span></div>
    <div className="feature-layout">
      <section className="feature-panel">
        <div className="panel-head"><div><span className="panel-kicker">IMPORTANCIA RELATIVA</span><h3>Señal por predictor</h3></div><CSVLink data={data.features.map((f) => ({ variable: f.label, unidad: f.unit, impacto_estandarizado: f.standardizedImpact, rango: f.rank }))} filename={`${id}-importancia.csv`} className="export-link" data-testid={`download-features-${id}`}><Download size={14} /> CSV</CSVLink></div>
        <div className="feature-bars">{data.features.map((feature, index) => <div className="feature-row" key={feature.key}>
          <div className="feature-name"><span className="rank-number">{String(feature.rank).padStart(2, '0')}</span><span><b>{feature.label}</b><small>{feature.unit || 'sin unidad'}</small></span></div>
          <div className="impact-track"><i style={{ width: `${Math.max(3, Math.min(100, Math.abs(feature.standardizedImpact) * 100))}%`, backgroundColor: COLORS[index % COLORS.length] }} /></div>
          <strong>{nfmt(feature.standardizedImpact, 3)}</strong>
        </div>)}</div>
        <div className="feature-range"><span>RANGO OBSERVADO</span>{data.features.map((feature) => <div key={feature.key}><b>{feature.label}</b><span>{nfmt(feature.min)} — {nfmt(feature.max)} {feature.unit}</span></div>)}</div>
      </section>
      <section className="coefficient-panel">
        <div className="panel-head"><div><span className="panel-kicker">ECUACIÓN DEL MODELO</span><h3>Coeficientes</h3></div></div>
        <div className="equation-wrap"><div className="equation-target">{data.targetLabel} =</div>
          {data.coefficients.map((coef) => <div className="coefficient-row" key={coef.term}><div><span className={`direction-sign ${coef.direction}`}>{coef.direction === 'positive' ? '+' : coef.direction === 'negative' ? '−' : '·'}</span><b>{coef.term}</b></div><strong>{nfmt(coef.coefficient, 4)}</strong><p>{coef.explanation}</p></div>)}
        </div>
        <div className="coefficient-foot">El signo indica dirección, manteniendo constantes las demás variables.</div>
      </section>
    </div>
    <div className="section-heading analysis-heading"><div><span className="section-index">04 — RELACIONES</span><h2 className="font-display">Mira la dispersión</h2></div><span className="section-caption">CADA PUNTO = UNA OBSERVACIÓN LIMPIA</span></div>
    <div className="scatter-grid">
      {data.scatterSeries.map((series, index) => {
        const chartRows = series.points.map((point) => ({ x: point.x, y: point.y }));
        return <section className="scatter-panel" key={series.featureKey}>
          <div className="panel-head"><div><span className="panel-kicker">VARIABLE EXPLICATIVA {String(index + 1).padStart(2, '0')}</span><h3>{series.label} <small>vs. {data.targetLabel}</small></h3></div>
            <CSVLink data={series.points.map((point) => ({ [series.label]: point.x, [data.targetLabel]: point.y }))} filename={`${id}-${series.featureKey}-dispersion.csv`} className="export-icon" aria-label={`Descargar CSV de ${series.label}`} data-testid={`download-scatter-${series.featureKey}`}><Download size={14} /></CSVLink>
          </div>
          <div className="chart-box">
            {chartRows.length ? <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ top: 12, right: 16, bottom: 14, left: 4 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 5" />
                <XAxis type="number" dataKey="x" name={series.label} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} label={{ value: `${series.label} (${series.unit})`, position: 'insideBottom', offset: -8, fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis type="number" dataKey="y" name={data.targetLabel} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={52} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))', fontSize: 12 }} formatter={(value: number) => nfmt(value, 3)} />
                <Scatter data={chartRows} fill={COLORS[index % COLORS.length]} fillOpacity={0.72} />
              </ScatterChart>
            </ResponsiveContainer> : <div className="chart-empty">No hay puntos disponibles para esta relación.</div>}
          </div>
          <div className="chart-foot"><span>{series.points.length} observaciones</span><span>{series.unit} · {data.targetUnit}</span></div>
        </section>;
      })}
    </div>
    <div className="section-heading analysis-heading"><div><span className="section-index">05 — EXPERIMENTO</span><h2 className="font-display">Prueba una predicción</h2></div><span className="section-caption">INGRESA TRES VALORES, EN EL ORDEN MOSTRADO</span></div>
    <PredictionForm key={data.id} analysis={data} mutation={prediction} />
    <section className="cleaned-data-panel">
      <div className="panel-head"><div><span className="panel-kicker">DATOS PREPARADOS PARA EL MODELO</span><h3>Vista de registros limpios</h3></div><CSVLink data={rowsForDownload} filename={`${id}-datos-limpios.csv`} className="button-outline" data-testid={`download-cleaned-${id}`}><Download size={14} /> Descargar CSV limpio</CSVLink></div>
      {data.cleanedRows.length ? <div className="table-scroll"><table><thead><tr>{data.features.map((f) => <th key={f.key}>{f.label} <small>{f.unit}</small></th>)}<th>{data.targetLabel} <small>{data.targetUnit}</small></th></tr></thead><tbody>
        {data.cleanedRows.slice(0, 12).map((row, index) => <tr key={`${id}-row-${index}`}>{data.features.map((feature, featureIndex) => <td key={feature.key}>{nfmt(row.values[featureIndex] ?? 0, 3)}</td>)}<td className="target-cell">{nfmt(row.target, 3)}</td></tr>)}
      </tbody></table></div> : <EmptyPanel title="No hay filas limpias" text="No hay registros disponibles para mostrar o descargar." />}
      <div className="table-caption">{data.cleanedRows.length ? `Se muestran ${Math.min(12, data.cleanedRows.length)} de ${nfmt(data.cleanedRows.length, 0)} registros. El CSV incluye todas las filas limpias.` : 'El archivo incluirá el estado vacío.'}</div>
    </section>
    <footer className="report-footer"><span>TRAZA / LABORATORIO DE MINERÍA DE DATOS</span><span>CONTEXTO ANTES QUE PREDICCIÓN</span><Link href="/" data-testid="link-report-home">IR AL RESUMEN →</Link></footer>
  </div>;
}

function MetricCard({ title, value, note, visual }: { title: string; value: string; note: string; visual: string }) {
  return <div className={`metric-card metric-${visual}`}><span className="metric-label">{title}</span><strong>{value}</strong><small>{note}</small><div className="metric-mark">{visual === 'r2' ? <Activity size={16} /> : visual === 'rmse' ? <ArrowDownRight size={16} /> : <Beaker size={16} />}</div></div>;
}

function PredictionForm({ analysis, mutation }: { analysis: ExerciseAnalysis; mutation: ReturnType<typeof usePredictExercise> }) {
  const [values, setValues] = useState(() => analysis.features.slice(0, 3).map((feature, index) => String(analysis.cleanedRows[0]?.values[index] ?? feature.mean)));
  const [formError, setFormError] = useState('');
  const result = mutation.data;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = values.map((value) => Number(value));
    if (parsed.length !== 3 || values.some((value) => value.trim() === '') || parsed.some((value) => !Number.isFinite(value))) {
      setFormError('Completa los tres campos con valores numéricos válidos.');
      return;
    }
    const integerFeatures = new Set(['Dia', 'Edad', 'Hora', 'Dia_Semana']);
    if (analysis.features.some((feature, index) => integerFeatures.has(feature.key) && !Number.isInteger(parsed[index]))) {
      setFormError('Día, edad y hora deben ser números enteros.');
      return;
    }
    setFormError('');
    mutation.mutate({ data: { exerciseId: analysis.id, values: parsed } });
  };
  return <div className="prediction-layout">
    <form className="prediction-form" onSubmit={submit} aria-busy={mutation.isPending}>
      <div className="prediction-form-head"><span className="panel-kicker">ENTRADA DEL MODELO</span><p>Usa valores dentro de los rangos observados para evitar extrapolar.</p></div>
      <div className="prediction-inputs">{analysis.features.slice(0, 3).map((feature, index) => <label key={feature.key} className="prediction-field">
        <span>{feature.label}<small>{feature.unit}</small></span>
        <input type="number" step={['Dia', 'Edad', 'Hora', 'Dia_Semana'].includes(feature.key) ? 1 : 'any'} value={values[index] ?? ''} min={feature.min} max={feature.max} onChange={(event) => { setValues((current) => current.map((v, i) => i === index ? event.target.value : v)); setFormError(''); mutation.reset(); }} data-testid={`input-predict-${feature.key}`} aria-label={feature.label} />
        <small className="range-hint">Rango: {nfmt(feature.min)} a {nfmt(feature.max)}</small>
      </label>)}</div>
      {formError && <p className="form-error" role="alert">{formError}</p>}
      {!!mutation.error && <p className="form-error" role="alert">{predictionErrorMessage(mutation.error)}</p>}
      <button className="predict-button" type="submit" disabled={mutation.isPending} data-testid="button-predict">
        {mutation.isPending ? <><RefreshCw size={15} className="spin" /> Calculando…</> : <>Calcular estimación <ArrowUpRight size={16} /></>}
      </button>
      <p className="prediction-disclaimer">La estimación depende de los datos y del ajuste actual. No representa certeza ni una relación causal.</p>
    </form>
    <div className={`prediction-result ${result ? 'has-result' : ''}`} aria-live="polite" data-testid="prediction-result">
      {result ? <>
        <div className="result-top"><span>ESTIMACIÓN DEL MODELO</span><span className="result-chip"><Check size={12} /> CALCULADA</span></div>
        <strong>{nfmt(result.predictedValue, 3)}</strong><span className="result-unit">{result.targetUnit} · {result.targetLabel}</span>
        <div className="result-note">{result.note}</div>
        <div className="result-caution"><AlertTriangle size={14} /> Interpreta junto al RMSE y los límites del conjunto.</div>
      </> : <><div className="result-placeholder"><span className="result-symbol">ŷ</span><span>La estimación<br />aparecerá aquí</span></div><div className="result-hint">Completa las variables para explorar qué devuelve el modelo.</div></>}
    </div>
  </div>;
}

function predictionErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const message = (data as { error?: unknown }).error;
      if (typeof message === 'string' && message.trim()) return message;
    }
  }
  return 'No se pudo calcular la predicción. Revisa los valores e inténtalo otra vez.';
}

function PageLoading() {
  return <div className="loading-page" aria-label="Cargando análisis"><div className="loading-head skeleton" /><div className="loading-line skeleton" /><div className="loading-stats">{[1, 2, 3].map((i) => <div className="skeleton loading-card" key={i} />)}</div><div className="skeleton loading-chart" /></div>;
}

function ErrorPanel({ retry }: { retry: () => void }) {
  return <div className="state-panel"><div className="state-symbol warning"><AlertTriangle size={22} /></div><span className="section-index">NO SE PUDO CARGAR</span><h2 className="font-display">El análisis no está disponible.</h2><p>Comprueba la conexión con el laboratorio y vuelve a intentarlo.</p><button className="button-outline" onClick={retry} data-testid="button-retry"><RefreshCw size={14} /> Reintentar</button></div>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="state-panel compact-state"><div className="state-symbol"><FlaskConical size={22} /></div><h2 className="font-display">{title}</h2><p>{text}</p></div>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  const [dark, setDark] = useState(() => localStorage.getItem('traza-theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('traza-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
    <RoutedErrorBoundary><Shell dark={dark} toggleDark={() => setDark((value) => !value)} /></RoutedErrorBoundary>
  </WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;