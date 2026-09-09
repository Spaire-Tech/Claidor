const { notarize } = require('@electron/notarize');
const path = require('path');

// Load .env when dotenv is available, but do not require it for packaging.
try {
  require('dotenv').config();
} catch (error) {
  if (!error || error.code !== 'MODULE_NOT_FOUND') {
    throw error;
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (!process.env.APPLE_ID || !process.env.APPLE_APP_SPECIFIC_PASSWORD) {
    console.warn('⚠️  Skipping notarization: APPLE_ID or APPLE_APP_SPECIFIC_PASSWORD is not set');
    console.warn('   To enable notarization, create a .env file with your Apple Developer credentials');
    console.warn('   See the .env.example template');
    return;
  }

  if (!process.env.APPLE_TEAM_ID) {
    console.warn('⚠️  Skipping notarization: APPLE_TEAM_ID is not set');
    console.warn('   Notarization requires APPLE_TEAM_ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`🔐 Notarizing ${appName}...`);
  console.log(`   App path: ${appPath}`);
  console.log(`   Apple ID: ${process.env.APPLE_ID}`);
  console.log(`   Team ID: ${process.env.APPLE_TEAM_ID}`);

  try {
    await notarize({
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
    });

    console.log('✅ Notarization succeeded');
    console.log('   The app is signed and notarized and can be distributed to users');
  } catch (error) {
    console.error('❌ Notarization failed:', error.message);
    console.error('   Check your Apple Developer credentials and try again');
    console.error('   See https://appstoreconnect.apple.com/notarization-history for details');
    throw error;
  }
};
