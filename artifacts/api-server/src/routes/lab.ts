import { Router, type IRouter } from "express";
import {
  GetExerciseAnalysisParams,
  PredictExerciseBody,
} from "@workspace/api-zod";
import {
  getExerciseAnalysis,
  getLabOverview,
  predictExercise,
  type ExerciseId,
} from "../lib/lab";

const router: IRouter = Router();

router.get("/lab/overview", (_req, res): void => {
  res.json(getLabOverview());
});

router.get("/lab/exercises/:exerciseId", (req, res): void => {
  const parsed = GetExerciseAnalysisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(getExerciseAnalysis(parsed.data.exerciseId as ExerciseId));
});

router.post("/lab/predict", (req, res): void => {
  const parsed = PredictExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    res.json(
      predictExercise(
        parsed.data.exerciseId as ExerciseId,
        parsed.data.values,
      ),
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "No se pudo generar la predicción.",
    });
  }
});

export default router;