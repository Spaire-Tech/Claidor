import{clampBlock,clampLine}from"../../../shared/sand-text.js";export const SECRET_REQUEST_MAX_LABEL_LENGTH=120,SECRET_REQUEST_MAX_DESCRIPTION_LENGTH=400;
export const clampSecretLabel=(v:string):string=>clampLine(v,120);export const clampSecretDescription=(v:string):string=>clampBlock(v,400);
export const summarizeSecretRequest=(r:{label:string}):string=>`Requested a secret from the user securely: ${r.label}`;
export function buildSecretProvidedAck(r:{label:string;target:{kind:string}}):string{return[`[The user securely provided the requested secret: "${r.label}". It was written straight to its destination (${r.target.kind}); you never see the value and it is not in this conversation.]`,"Confirm to the user that it is stored, then continue. It is stored for a messaging channel, and messaging channels are coming soon in Simeon, so no connection links from it yet; say so rather than reporting a connection."].join("\n")}

