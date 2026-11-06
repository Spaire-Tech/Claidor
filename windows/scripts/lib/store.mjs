// The Microsoft Store package's identity, as Partner Center gives it
// (Apps and games › Simeon › Product management › Product identity), read
// from windows/store.json and checked before anything is built
// (scripts/store.mjs). None of it is secret: Partner Center shows it to
// anyone with the app, and it is written in every package.

/** Where each value is in Partner Center's Product identity page. */
export const identityFields = {
  identityName: 'Package/Identity/Name',
  publisher: 'Package/Identity/Publisher',
  publisherDisplayName: 'Package/Properties/PublisherDisplayName',
}

/**
 * The identity from store.json's text: `{ identity }` when every value is
 * there and well formed, else `{ missing, wrong }`, the fields to fill in or
 * correct.
 */
export function readStoreIdentity(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { missing: [], wrong: ['store.json is not JSON'] }
  }
  const missing = []
  const wrong = []
  const field = (name) => {
    const found = typeof value?.[name] === 'string' ? value[name].trim() : ''
    if (found === '') missing.push(name)
    return found
  }
  const identityName = field('identityName')
  const publisher = field('publisher')
  const publisherDisplayName = field('publisherDisplayName')
  // e.g. "ExampleCo.Simeon": 3 to 50 letters, digits, dots and dashes.
  if (identityName !== '' && !/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) wrong.push('identityName')
  // e.g. "CN=1A2B3C4D-…": a distinguished name, as Partner Center writes it.
  if (publisher !== '' && !/^CN=[^,]+(,\s*[A-Z]+=[^,]+)*$/.test(publisher)) wrong.push('publisher')
  if (publisherDisplayName.length > 256) wrong.push('publisherDisplayName')
  if (missing.length > 0 || wrong.length > 0) return { missing, wrong }
  return { identity: { identityName, publisher, publisherDisplayName } }
}

// A test copy for this PC (`node scripts/store.mjs --test`, 6 November 2026,
// the founder: "ok lets test then"): Windows installs only a signed package,
// and the Store signs only the one uploaded. So the test copy is signed with
// a certificate made on this PC for the Store's own publisher (Windows wants
// the two to match), trusted on this PC only, and installed. The PowerShell
// it runs is written here, where the tests read it.

/** The test certificate's name in the PC's certificates. */
export const TEST_CERTIFICATE_NAME = 'Simeon Store test (this PC only)'

/** A PowerShell string, as written: single quotes, a quote doubled. */
export function psQuote(text) {
  return `'${String(text).replace(/'/g, "''")}'`
}

/** A script for `powershell.exe -EncodedCommand`: UTF-16 in base64, so no quoting or new line is lost on the way. */
export function encodeScript(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** This person's test certificate for the publisher, made the first time (for three months); prints its thumbprint. */
export function testCertificateScript(publisher) {
  const name = psQuote(TEST_CERTIFICATE_NAME)
  return [
    "$ErrorActionPreference = 'Stop'",
    `$subject = ${psQuote(publisher)}`,
    `$cert = Get-ChildItem 'Cert:\\CurrentUser\\My' | Where-Object { $_.Subject -eq $subject -and $_.FriendlyName -eq ${name} -and $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date).AddDays(1) } | Select-Object -First 1`,
    // Code signing (1.3.6.1.5.5.7.3.3), and no authority of its own: the two lines Microsoft's own steps give.
    `if (-not $cert) { $cert = New-SelfSignedCertificate -Type Custom -Subject $subject -KeyUsage DigitalSignature -FriendlyName ${name} -CertStoreLocation 'Cert:\\CurrentUser\\My' -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}') -NotAfter (Get-Date).AddMonths(3) }`,
    'Write-Output $cert.Thumbprint',
  ].join('\n')
}

/** Prints True when this PC trusts the certificate for packages (the PC's Trusted People, where Windows looks). */
export function trustedScript(thumbprint) {
  return `Test-Path ${psQuote(`Cert:\\LocalMachine\\TrustedPeople\\${thumbprint}`)}`
}

/** Puts the certificate (its public half only) in this PC's Trusted People; Windows asks first, as for any change to the PC. */
export function trustScript(thumbprint, cerPath) {
  const inner = [
    "$ErrorActionPreference = 'Stop'",
    `Import-Certificate -FilePath ${psQuote(cerPath)} -CertStoreLocation 'Cert:\\LocalMachine\\TrustedPeople' | Out-Null`,
  ].join('\n')
  return [
    "$ErrorActionPreference = 'Stop'",
    `Export-Certificate -Cert ${psQuote(`Cert:\\CurrentUser\\My\\${thumbprint}`)} -FilePath ${psQuote(cerPath)} | Out-Null`,
    `Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${encodeScript(inner)}'`,
  ].join('\n')
}

/** Installs the test copy (over an earlier test copy of any version), closing Simeon if it is open. */
export function installScript(appxPath) {
  return [
    "$ErrorActionPreference = 'Stop'",
    `Add-AppxPackage -Path ${psQuote(appxPath)} -ForceApplicationShutdown -ForceUpdateFromAnyVersion`,
  ].join('\n')
}
