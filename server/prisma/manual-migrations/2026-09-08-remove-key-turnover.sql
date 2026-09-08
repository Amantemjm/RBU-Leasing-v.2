-- Key Turnover has been removed from the pipeline. Its Appointment rows would
-- otherwise surface in a transaction's appointment list with no stage left to
-- label them, since listForTransaction returns every appointment regardless of
-- stage. Idempotent: a second run finds nothing to delete.
--
-- Stale stageData.KEY_TURNOVER keys on completed transactions are deliberately
-- left alone. The tracker iterates LEASING_STAGES, so an unknown key renders
-- nothing, and rewriting JSON on live rows is more risk than the tidiness is
-- worth.
DO $$
DECLARE removed INTEGER;
BEGIN
  DELETE FROM "Appointment" WHERE "stage" = 'KEY_TURNOVER';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RAISE NOTICE 'Removed % Key Turnover appointment(s)', removed;
END $$;

-- A LeasingTransaction whose stage column is still 'KEY_TURNOVER' is now
-- unactionable in both directions: nextStageKey/prevStageKey return null for
-- an unknown key, so advance() throws "already at the final stage" and
-- returnStage() throws "already at the first stage", while the tracker UI
-- renders a blank stage name with both buttons disabled. Dev had none of
-- these, but the office server may. Report only — do not re-stage them
-- automatically; someone must decide where each one belongs. Idempotent: a
-- second run just reports the same count again.
DO $$
DECLARE stranded INTEGER;
BEGIN
  SELECT COUNT(*) INTO stranded FROM "LeasingTransaction" WHERE "stage" = 'KEY_TURNOVER';
  IF stranded > 0 THEN
    RAISE NOTICE 'Found % LeasingTransaction row(s) stranded at stage = KEY_TURNOVER — advance()/returnStage() will throw for these; they need a manual re-stage decision', stranded;
  ELSE
    RAISE NOTICE 'No LeasingTransaction rows stranded at stage = KEY_TURNOVER';
  END IF;
END $$;
