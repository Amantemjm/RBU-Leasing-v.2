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
