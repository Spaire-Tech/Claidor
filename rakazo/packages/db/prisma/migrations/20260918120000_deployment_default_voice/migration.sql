-- One voice provider for the whole deployment, keyed by the operator, so the
-- default voice has to live somewhere that is not a per-user credential row.
-- Space voice preferences hang off UserVoiceCredential by a non-null foreign
-- key, and there are no such rows when the key is the deployment's.
ALTER TABLE "deployment_settings" ADD COLUMN "defaultVoiceId" text;
