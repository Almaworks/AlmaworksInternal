import assert from 'node:assert/strict';
import test from 'node:test';
import { callbackErrorDestination, isAuthServiceUnavailable } from '../../src/auth/auth-errors.ts';

test('only expired tokens are described as expired links', () => {
  assert.equal(callbackErrorDestination({ code: 'otp_expired' }), '/?error=link_expired');
  assert.equal(callbackErrorDestination({ code: 'bad_code_verifier' }), '/?error=signin_failed');
  assert.equal(callbackErrorDestination(null), '/?error=signin_failed');
});
test('network failures are distinct from invalid credentials and expired links', () => {
  assert.equal(isAuthServiceUnavailable({ name: 'AuthRetryableFetchError' }), true);
  assert.equal(callbackErrorDestination({ name: 'AuthRetryableFetchError' }), '/?error=auth_unavailable');
  assert.equal(isAuthServiceUnavailable({ status: 503 }), true);
  assert.equal(isAuthServiceUnavailable({ code: 'invalid_credentials', status: 400 }), false);
});
