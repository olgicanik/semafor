import { calculateJobStatus } from './statusCalculator.js';

/** Stable per-module id sequence — deterministic for golden tests (v2 used Math.random()). */
let seq = 0;
const nextId = (prefix) => { seq += 1; return `${prefix}-${seq}`; };

const j = (name, rawStatus, errorMessage = '', project = 'SAP-Sync') => {
  const status = calculateJobStatus({ rawStatus, errorMessage });
  return { id: nextId('job'), name, project,
           rawStatus, errorMessage, status,
           lastRun: new Date(Date.now() - Math.floor(Math.random() * 8e5)).toISOString() };
};
// lastRun randomness is time-based only (a valid golden: assert date parsability, not exact value).

const srv = (id, name, environment, jobs) => ({ id, name, environment, is_pinned: false, jobs });

/** Live mutable store — mock Create Server mutates this array so the next poll sees it. */
export const MOCK_SERVERS = [
  srv('10.20.30.41', 'tac-sl3-01', 'dev', [
    j('ETL_Sync_SAP', 'Ready to run'),
    j('Data_Ingestion_Job', 'Ended with errors', 'Timeout after 60s'),
    j('Nightly_Reindex', 'Ready to run'),
  ]),
  srv('10.20.30.42', 'tac-sl3-02', 'dev', [
    j('ETL_Sync_SAP', 'Ended with errors', 'Killed by user at 22:14'),
    j('Billing_Batch', 'Ready to run'),
  ]),
  srv('10.40.50.11', 'tac-sl4-01', 'qa', [
    j('Payments_Settlement', 'Ended with errors', 'Connection refused to 10.40.50.9:8080'),
    j('Risk_Scoring', 'Ready to run'),
    j('Audit_Export', 'Ended with errors', 'Schema mismatch on column invoice_no'),
    j('Report_Archive', 'Running - stage 2 of 4'),
  ]),
  srv('10.40.50.12', 'tac-sl4-02', 'qa', [
    j('Payments_Settlement', 'Ready to run'),
    j('Ledger_Sync', 'Ended with errors', 'Timeout after 120s'),
  ]),
  srv('10.60.70.21', 'tac-sl4-03', 'prod', [
    j('ETL_Sync_SAP', 'Ready to run'),
    j('Fraud_Model_Refresh', 'Ready to run'),
    j('Regulatory_Export', 'Ready to run'),
  ]),
  srv('10.60.70.22', 'tac-sl4-04', 'prod', [
    j('Payments_Settlement', 'Ended with errors', 'System fault in dispatcher (err 0x7F23)'),
    j('Data_Ingestion_Job', 'Ready to run'),
  ]),
];

/** Mock Create Server: mirrors the backend POST /api/servers semantics (is_pinned False, empty history). */
export function mockCreateServer({ name, environment = 'dev', auth_type = 'api_key', ...rest } = {}) {
  const server = { id: nextId('mock-srv'), name, environment, auth_type,
                   auth_credentials: {}, is_pinned: false, history: [], jobs: [], ...rest };
  MOCK_SERVERS.push(server);
  return server;
}

export default { servers: MOCK_SERVERS };
