import { runHistoricalEvaluation } from "../packages/agents/src/eval-harness.js";

async function main() {
  const args = process.argv.slice(2);
  const thresholdArg = args.find((arg) => arg.startsWith("--threshold="));
  const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : 30;

  process.stdout.write(
    `Starting historical evaluation (threshold: ${threshold})...\n`,
  );
  const report = await runHistoricalEvaluation({ riskThreshold: threshold });

  process.stdout.write("\n=== Historical PR Evaluation Report ===\n");
  process.stdout.write(`Run ID: ${report.run_id}\n`);
  process.stdout.write(`Dataset: ${report.dataset_name}\n`);
  process.stdout.write(`Total Evaluated: ${report.metrics.totalEvaluated}\n`);
  process.stdout.write(`Total Excluded: ${report.metrics.totalExcluded}\n`);
  process.stdout.write(
    `Confusion Matrix: TP=${report.metrics.tp}, FP=${report.metrics.fp}, TN=${report.metrics.tn}, FN=${report.metrics.fn}\n`,
  );
  process.stdout.write(
    `Precision: ${report.metrics.precision !== null ? (report.metrics.precision * 100).toFixed(1) + "%" : "undefined"}\n`,
  );
  process.stdout.write(
    `Recall: ${report.metrics.recall !== null ? (report.metrics.recall * 100).toFixed(1) + "%" : "undefined"}\n`,
  );
  process.stdout.write(
    `False Positive Rate: ${report.metrics.falsePositiveRate !== null ? (report.metrics.falsePositiveRate * 100).toFixed(1) + "%" : "undefined"}\n`,
  );
  process.stdout.write(
    `F1 Score: ${report.metrics.f1Score !== null ? report.metrics.f1Score.toFixed(3) : "undefined"}\n`,
  );
  process.stdout.write(
    `Accuracy: ${report.metrics.accuracy !== null ? (report.metrics.accuracy * 100).toFixed(1) + "%" : "undefined"}\n`,
  );
  if (report.metrics.notes.length > 0) {
    process.stdout.write(`Notes: ${report.metrics.notes.join("; ")}\n`);
  }
  process.stdout.write(
    "Evaluation complete. Report saved to tests/corpus-measurements/eval-report.json\n",
  );
}

await main();
