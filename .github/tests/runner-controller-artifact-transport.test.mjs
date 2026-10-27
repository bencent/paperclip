import test from 'node:test';
import { verifyControllerRuntime } from '../../packages/paperclip-runner/scripts/controlled-evals/verify-runtime.mjs';

// This integration test consumes bytes returned by the real GitHub artifact service.
// Local test discovery has no uploaded artifact; the controlled workflow supplies it.
test('the uploaded controller preserves every inventoried runtime file', {
  skip: !process.env.PAPERCLIP_CONTROLLER_TRANSPORT_DIRECTORY,
}, async () => {
  await verifyControllerRuntime({
    directory: process.env.PAPERCLIP_CONTROLLER_TRANSPORT_DIRECTORY,
    sourceRevision: process.env.GITHUB_SHA,
    receiptSha256: process.env.PAPERCLIP_CONTROLLER_RECEIPT_SHA256,
  });
});
